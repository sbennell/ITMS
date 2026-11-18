<#
.SYNOPSIS
    Student AD account and home folder sync, run by the ITMS API.

.DESCRIPTION
    Ported from Student_AD_Account_Management.ps1 and Student_Drive_Management.ps1.
    ITMS writes the students and settings to -InputFile as JSON. This script writes the
    result of each student to -OutputFile as JSON.

    Preview only reads AD and the file system and lists the changes it would make.
    Apply makes them. Passwords are reset for every student on Apply.

    Requires the ActiveDirectory module (RSAT). The account running ITMS needs rights
    to manage the student OUs and Full Control of the student folder root.
#>
param(
    [Parameter(Mandatory = $true)][ValidateSet('Preview', 'Apply')][string]$Mode,
    [Parameter(Mandatory = $true)][string]$InputFile,
    [Parameter(Mandatory = $true)][string]$OutputFile
)

$ErrorActionPreference = 'Stop'
$apply = $Mode -eq 'Apply'
$results = New-Object System.Collections.Generic.List[object]

function Write-Output-File {
    param([bool]$Ok, [string]$ErrorMessage)
    $output = [ordered]@{ ok = $Ok; error = $ErrorMessage; results = $results }
    $json = ConvertTo-Json -InputObject $output -Depth 6
    [System.IO.File]::WriteAllText($OutputFile, $json, (New-Object System.Text.UTF8Encoding($false)))
}

try {
    Import-Module ActiveDirectory
} catch {
    Write-Output-File -Ok $false -ErrorMessage "The ActiveDirectory PowerShell module is not installed (RSAT): $($_.Exception.Message)"
    exit 1
}

$data = Get-Content -LiteralPath $InputFile -Raw -Encoding UTF8 | ConvertFrom-Json
$config = $data.config
$editDate = Get-Date -Format 'yyyyMMdd'

# Use one domain controller for the whole run, so accounts and groups created here
# can be found straight away without waiting for replication
try {
    $dc = @((Get-ADDomainController -Discover -Writable).HostName)[0]
    $PSDefaultParameterValues['*-AD*:Server'] = $dc
} catch {
    Write-Output-File -Ok $false -ErrorMessage "No domain controller could be found: $($_.Exception.Message)"
    exit 1
}
$foldersEnabled = [bool]$config.driveRootPath

# Things already created or checked during this run, so each is listed or done once
$seen = @{}

# --- Helpers -------------------------------------------------------------------------

function Get-ParentDN([string]$DN) {
    # Strip the first RDN. Commas escaped with a backslash are part of the name.
    return ($DN -replace '^.+?(?<!\\),', '')
}

function Get-GroupName([string]$DN) {
    return (($DN -split '(?<!\\),')[0] -replace '^CN=', '')
}

function Find-ADStudent([string]$Username) {
    $safe = $Username -replace "'", "''"
    return Get-ADUser -Filter "SamAccountName -eq '$safe'" -Properties MemberOf, DisplayName, EmailAddress, Description, Office, Title, Company, EmployeeID, ScriptPath
}

function Test-ADPath([string]$DN) {
    try { $null = Get-ADObject -Identity $DN; return $true } catch { return $false }
}

# Creates an OU and any missing parents. In Preview it only lists them.
function Confirm-OU([string]$OUPath, $Steps) {
    if ($seen.ContainsKey("ou:$OUPath")) { return }
    $seen["ou:$OUPath"] = $true
    if (Test-ADPath $OUPath) { return }

    $parts = $OUPath -split '(?<!\\),'
    $current = ($parts | Where-Object { $_ -like 'DC=*' }) -join ','
    $ouParts = @($parts | Where-Object { $_ -like 'OU=*' })
    [array]::Reverse($ouParts)
    foreach ($ou in $ouParts) {
        $full = "$ou,$current"
        if (-not $seen.ContainsKey("ou-made:$full") -and -not (Test-ADPath $full)) {
            $seen["ou-made:$full"] = $true
            $Steps.Add("Create OU $full")
            if ($apply) { New-ADOrganizationalUnit -Name ($ou -replace '^OU=', '') -Path $current }
        }
        $current = $full
    }
}

function Confirm-Group([string]$GroupDN, $Steps) {
    if ($seen.ContainsKey("group:$GroupDN")) { return }
    $seen["group:$GroupDN"] = $true
    if (Test-ADPath $GroupDN) { return }

    $parent = Get-ParentDN $GroupDN
    Confirm-OU $parent $Steps
    $Steps.Add("Create group $GroupDN")
    if ($apply) {
        $group = New-ADGroup -Name (Get-GroupName $GroupDN) -Path $parent -GroupScope Global -GroupCategory Security -PassThru
        $groupSids[$GroupDN] = $group.SID
    }
}

# Folder permissions use SIDs, so Windows never has to look a name up
$groupSids = @{}
function Get-GroupSid([string]$GroupDN) {
    if (-not $groupSids.ContainsKey($GroupDN)) {
        try {
            $groupSids[$GroupDN] = (Get-ADGroup -Identity $GroupDN).SID
        } catch {
            throw "Group $GroupDN was not found in AD"
        }
    }
    return $groupSids[$GroupDN]
}

function Remove-AllGroups($User, $Steps) {
    foreach ($groupDN in @($User.MemberOf)) {
        $Steps.Add("Remove from group $(Get-GroupName $groupDN)")
        if ($apply) { Remove-ADGroupMember -Identity $groupDN -Members $User.ObjectGUID -Confirm:$false }
    }
}

function Blank-To-Null($Value) {
    if ([string]::IsNullOrWhiteSpace([string]$Value)) { return $null }
    return [string]$Value
}

# --- Folder helpers -----------------------------------------------------------------

function New-Rule([System.Security.Principal.SecurityIdentifier]$Sid, [string]$Rights, [string]$Inherit) {
    return New-Object System.Security.AccessControl.FileSystemAccessRule($Sid, $Rights, $Inherit, 'None', 'Allow')
}

function Set-FolderAcl([string]$Path, [object[]]$Rules) {
    $acl = Get-Acl -LiteralPath $Path
    # Remove inherited permissions, as the original script did
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in $Rules) { $acl.AddAccessRule($rule) }
    Set-Acl -LiteralPath $Path -AclObject $acl
}

$inheritAll = 'ContainerInherit,ObjectInherit'

function Get-BaseRules {
    return @(
        (New-Rule ([System.Security.Principal.SecurityIdentifier]'S-1-5-18') 'FullControl' $inheritAll),     # SYSTEM
        (New-Rule ([System.Security.Principal.SecurityIdentifier]'S-1-5-32-544') 'FullControl' $inheritAll)  # Administrators
    )
}

# Root, Inactive and Year/Form folders: Staff read only, Students read this folder only
function Set-ContainerFolderAcl([string]$Path) {
    Set-FolderAcl $Path ((Get-BaseRules) + @(
        (New-Rule (Get-GroupSid $config.staffGroupDN) 'ReadAndExecute' $inheritAll),
        (New-Rule (Get-GroupSid $config.studentsGroupDN) 'ReadAndExecute' 'None')
    ))
}

# Student folder: Staff full control, the student modify
function Set-StudentFolderAcl([string]$Path, $User) {
    Set-FolderAcl $Path ((Get-BaseRules) + @(
        (New-Rule (Get-GroupSid $config.staffGroupDN) 'FullControl' $inheritAll),
        (New-Rule $User.SID 'Modify' $inheritAll)
    ))
}

function Get-FolderName([string]$First, [string]$Last, [bool]$Alternate = $false) {
    $firstFirst = $config.folderNameFormat -eq 'FirstnameLastname'
    if ($Alternate) { $firstFirst = -not $firstFirst }
    if ($firstFirst) { return "$First $Last" }
    return "$Last $First"
}

# Finds a student's folder in any Year/Form folder or Inactive, in either name format
function Find-StudentFolder([string]$First, [string]$Last) {
    $names = @((Get-FolderName $First $Last), (Get-FolderName $First $Last $true))
    $inactive = [System.IO.Path]::GetFullPath($config.driveInactiveFolder).TrimEnd('\')
    $parents = @(Get-ChildItem -LiteralPath $config.driveRootPath -Directory |
        Where-Object { $_.FullName.TrimEnd('\') -ne $inactive } |
        ForEach-Object { $_.FullName })
    $parents += $config.driveInactiveFolder

    foreach ($name in $names) {
        foreach ($parent in $parents) {
            $candidate = Join-Path $parent $name
            if (Test-Path -LiteralPath $candidate) { return $candidate }
        }
    }
    return $null
}

function Sync-StudentFolder($Student, $User, $Steps) {
    $orgName = if ($config.organizeBy -eq 'YearLevel') { $Student.yearLevel } else { $Student.form }
    if (-not $orgName) { throw "No $($config.organizeBy) to place the home folder in" }

    $parent = Join-Path $config.driveRootPath $orgName
    $target = Join-Path $parent (Get-FolderName $Student.firstName $Student.surname)

    if (-not $seen.ContainsKey("dir:$parent")) {
        $seen["dir:$parent"] = $true
        if (-not (Test-Path -LiteralPath $parent)) {
            $Steps.Add("Create folder $parent")
            if ($apply) { $null = New-Item -ItemType Directory -Path $parent }
        }
        if ($apply) { Set-ContainerFolderAcl $parent }
    }

    $existing = Find-StudentFolder $Student.firstName $Student.surname
    if (-not $existing) {
        $Steps.Add("Create home folder $target")
        if ($apply) { $null = New-Item -ItemType Directory -Path $target }
    } elseif ($existing -ne $target) {
        $Steps.Add("Move home folder $existing to $target")
        if ($apply) { Move-Item -LiteralPath $existing -Destination $target }
    }

    # Permissions are reapplied on every run, as the original script did
    if ($apply) { Set-StudentFolderAcl $target $User }
}

function Move-FolderToInactive($Student, $Steps) {
    $existing = Find-StudentFolder $Student.firstName $Student.surname
    if (-not $existing) { return }
    if ((Split-Path -Parent $existing).TrimEnd('\') -eq $config.driveInactiveFolder.TrimEnd('\')) { return }

    $name = Get-FolderName $Student.firstName $Student.surname
    $target = Join-Path $config.driveInactiveFolder $name
    if (Test-Path -LiteralPath $target) {
        $target = Join-Path $config.driveInactiveFolder "$($name)_$editDate"
    }
    $Steps.Add("Move home folder $existing to $target")
    if ($apply) { Move-Item -LiteralPath $existing -Destination $target }
}

# --- Students -----------------------------------------------------------------------

function Sync-Student($Student, $Steps) {
    $username = $Student.username
    $first = $Student.firstName
    $last = $Student.surname
    if (-not $Student.form) { throw 'No form (home group), so the account OU is unknown' }

    $formOU = "OU=$($Student.form),$($config.studentsOU)"
    $fullName = "$first $last ($username)"
    $displayName = "$first $last"
    $groups = @($config.studentsGroupDN)
    if ($Student.yearLevel) { $groups += "CN=$($Student.yearLevel),$($config.yearGroupsOU)" }
    $groups += "CN=$($Student.form),$($config.yearGroupsOU)"

    Confirm-OU $formOU $Steps
    foreach ($group in $groups) { Confirm-Group $group $Steps }

    $attributes = [ordered]@{
        EmailAddress = Blank-To-Null $Student.email
        DisplayName  = $displayName
        Description  = Blank-To-Null $Student.yearLevel
        Office       = Blank-To-Null $Student.form
        Title        = Blank-To-Null $Student.gender
        Company      = Blank-To-Null $Student.studentNumber
        EmployeeID   = Blank-To-Null $Student.governmentNumber
        ScriptPath   = Blank-To-Null $config.logonScript
    }

    $user = Find-ADStudent $username
    $action = 'update'

    if (-not $user) {
        $action = 'create'
        if (-not $Student.password) { throw 'No password, so the account cannot be created' }
        $Steps.Add("Create account in $formOU")
        if ($apply) {
            $params = @{
                Name                  = $fullName
                SamAccountName        = $username
                GivenName             = $first
                Surname               = $last
                Department            = $editDate
                AccountPassword       = (ConvertTo-SecureString $Student.password -AsPlainText -Force)
                Path                  = $formOU
                Enabled               = $true
                PasswordNeverExpires  = $true
                CannotChangePassword  = $true
                ChangePasswordAtLogon = $false
            }
            if ($Student.email) { $params.UserPrincipalName = $Student.email }
            foreach ($key in $attributes.Keys) {
                if ($null -ne $attributes[$key]) { $params[$key] = $attributes[$key] }
            }
            $user = New-ADUser @params -PassThru
        }
    } else {
        if (-not $user.Enabled) {
            $Steps.Add('Enable account')
            if ($apply) { Enable-ADAccount -Identity $user.ObjectGUID }
        }

        if ((Get-ParentDN $user.DistinguishedName) -ne $formOU) {
            $Steps.Add("Move to $formOU")
            if ($apply) { Move-ADObject -Identity $user.ObjectGUID -TargetPath $formOU }
        }

        if ($user.Name -ne $fullName) {
            $Steps.Add("Rename to $fullName")
            if ($apply) { Rename-ADObject -Identity $user.ObjectGUID -NewName $fullName }
        }

        $changed = @()
        if ($user.GivenName -ne $first) { $changed += 'GivenName' }
        if ($user.Surname -ne $last) { $changed += 'Surname' }
        foreach ($key in $attributes.Keys) {
            if ([string]$user.$key -ne [string]$attributes[$key]) { $changed += $key }
        }
        if ($changed.Count -gt 0) {
            $Steps.Add("Update $($changed -join ', ')")
            if ($apply) {
                $set = @{ GivenName = $first; Surname = $last; Department = $editDate; PasswordNeverExpires = $true; CannotChangePassword = $true }
                $clear = @()
                foreach ($key in $attributes.Keys) {
                    if ($null -eq $attributes[$key]) { $clear += $key } else { $set[$key] = $attributes[$key] }
                }
                Set-ADUser -Identity $user.ObjectGUID @set
                # Set-ADUser cannot set a blank value, so blanks are cleared by LDAP name
                $ldapNames = @{ EmailAddress = 'mail'; Description = 'description'; Office = 'physicalDeliveryOfficeName'; Title = 'title'; Company = 'company'; EmployeeID = 'employeeID'; ScriptPath = 'scriptPath' }
                $clearNames = @($clear | ForEach-Object { $ldapNames[$_] } | Where-Object { $_ })
                if ($clearNames.Count -gt 0) { Set-ADUser -Identity $user.ObjectGUID -Clear $clearNames }
            }
        }

        if ($apply -and $Student.password) {
            Set-ADAccountPassword -Identity $user.ObjectGUID -NewPassword (ConvertTo-SecureString $Student.password -AsPlainText -Force) -Reset
        }
    }

    # Group memberships end up as exactly the Students, Year and Form groups
    # A new account (or one only in Preview) has no groups, and New-ADUser does not return MemberOf
    $current = @($user.MemberOf | Where-Object { $_ })
    foreach ($groupDN in $current) {
        if ($groups -notcontains $groupDN) {
            $Steps.Add("Remove from group $(Get-GroupName $groupDN)")
            if ($apply) { Remove-ADGroupMember -Identity $groupDN -Members $user.ObjectGUID -Confirm:$false }
        }
    }
    foreach ($groupDN in $groups) {
        if ($current -notcontains $groupDN) {
            $Steps.Add("Add to group $(Get-GroupName $groupDN)")
            if ($apply) { Add-ADGroupMember -Identity $groupDN -Members $user.ObjectGUID }
        }
    }

    if ($foldersEnabled) { Sync-StudentFolder $Student $user $Steps }
    return $action
}

function Disable-Student($Student, $Steps) {
    $user = Find-ADStudent $Student.username
    if (-not $user) {
        $Steps.Add('No AD account found')
    } else {
        $inInactiveOU = (Get-ParentDN $user.DistinguishedName) -eq $config.inactiveOU
        if ($user.Enabled -or -not $inInactiveOU) {
            $leftDate = Get-Date -Format 'dd/MM/yyyy'
            $Steps.Add("Set description to Left Student $leftDate")
            if ($apply) { Set-ADUser -Identity $user.ObjectGUID -Description "Left Student $leftDate" }
        }
        Remove-AllGroups $user $Steps
        if ($user.Enabled) {
            $Steps.Add('Disable account')
            if ($apply) { Disable-ADAccount -Identity $user.ObjectGUID }
        }
        if (-not $inInactiveOU) {
            $Steps.Add("Move to $($config.inactiveOU)")
            if ($apply) { Move-ADObject -Identity $user.ObjectGUID -TargetPath $config.inactiveOU }
        }
    }

    if ($foldersEnabled) { Move-FolderToInactive $Student $Steps }
    if ($Steps.Count -eq 0 -or ($Steps.Count -eq 1 -and $Steps[0] -eq 'No AD account found')) { return 'none' }
    return 'disable'
}

# --- Run ----------------------------------------------------------------------------

try {
    $setupSteps = New-Object System.Collections.Generic.List[string]
    Confirm-OU $config.studentsOU $setupSteps
    Confirm-OU $config.inactiveOU $setupSteps
    Confirm-OU $config.yearGroupsOU $setupSteps
    Confirm-Group $config.studentsGroupDN $setupSteps

    if ($foldersEnabled) {
        if (-not (Test-Path -LiteralPath $config.driveRootPath)) { throw "Student folder root $($config.driveRootPath) was not found" }
        # Checked in Preview too, as the Staff group is never created
        $null = Get-GroupSid $config.staffGroupDN
        if (-not (Test-Path -LiteralPath $config.driveInactiveFolder)) {
            $setupSteps.Add("Create folder $($config.driveInactiveFolder)")
            if ($apply) { $null = New-Item -ItemType Directory -Path $config.driveInactiveFolder }
        }
        if ($apply) {
            Set-ContainerFolderAcl $config.driveRootPath
            Set-ContainerFolderAcl $config.driveInactiveFolder
        }
    }

    if ($setupSteps.Count -gt 0) {
        $results.Add([ordered]@{ username = ''; name = 'Setup'; action = 'setup'; ok = $true; error = $null; steps = $setupSteps })
    }
} catch {
    Write-Output-File -Ok $false -ErrorMessage "Setup failed: $($_.Exception.Message)"
    exit 1
}

foreach ($student in @($data.students)) {
    $steps = New-Object System.Collections.Generic.List[string]
    $result = [ordered]@{
        username = $student.username
        name     = "$($student.firstName) $($student.surname)"
        action   = $student.action
        ok       = $true
        error    = $null
        steps    = $steps
    }
    try {
        if ($student.action -eq 'disable') {
            $result.action = Disable-Student $student $steps
        } else {
            $kind = Sync-Student $student $steps
            $result.action = if ($kind -eq 'update' -and $steps.Count -eq 0) { 'none' } else { $kind }
        }
    } catch {
        $result.ok = $false
        $result.error = $_.Exception.Message
    }
    $results.Add($result)
}

Write-Output-File -Ok $true -ErrorMessage $null
