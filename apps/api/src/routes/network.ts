import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin } from './auth.js';

const router = Router();

// ============ CIDR HELPERS ============

/**
 * Parse and validate CIDR notation (e.g., "192.168.1.0/24")
 * Returns network info or null if invalid
 * Validates: format, prefix length 20-32, and that host bits are zero
 */
function parseCidr(cidr: string): { networkInt: number; prefixLen: number; count: number } | null {
  const match = cidr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
  if (!match) return null;

  const octets = [1, 2, 3, 4].map(i => parseInt(match[i]));
  if (octets.some(o => o > 255)) return null;

  const prefixLen = parseInt(match[5]);
  if (prefixLen < 20 || prefixLen > 32) return null;

  // Convert to 32-bit integer
  const networkInt =
    ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;

  // Create network mask
  const mask = prefixLen === 32 ? 0xffffffff : ~(0xffffffff >>> prefixLen);
  const maskedNetwork = networkInt & mask;

  // Check that host bits are zero (valid network address)
  if ((networkInt & ~mask) !== 0) return null;

  // Calculate number of usable host IPs (total - network - broadcast)
  const count = prefixLen === 32 ? 1 : (1 << (32 - prefixLen)) - 2;

  return { networkInt: maskedNetwork, prefixLen, count };
}

/**
 * Expand a CIDR into all host IP addresses
 */
function expandCidr(cidr: string): string[] {
  const parsed = parseCidr(cidr);
  if (!parsed) return [];

  const { networkInt, prefixLen, count } = parsed;
  const ips: string[] = [];

  // For /32, return the single IP; otherwise start at .1 and end at .254 (skip network and broadcast)
  const start = prefixLen === 32 ? 0 : 1;
  const end = prefixLen === 32 ? 1 : count + 1;

  for (let i = start; i < end; i++) {
    const n = (networkInt + i) >>> 0;
    ips.push(`${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`);
  }

  return ips;
}

// ============ SUBNETS - CRUD ============

router.use(requireAuth);

// GET all subnets
router.get('/subnets', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  try {
    const subnets = await prisma.subnet.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(subnets);
  } catch (error) {
    console.error('Error fetching subnets:', error);
    res.status(500).json({ error: 'Failed to fetch subnets' });
  }
});

// POST create subnet (admin only)
router.post('/subnets', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const { name, cidr } = req.body;

  if (!name || !cidr) {
    return res.status(400).json({ error: 'Name and CIDR are required' });
  }

  // Validate CIDR
  if (!parseCidr(cidr)) {
    return res.status(400).json({
      error: 'Invalid CIDR format. Use notation like 192.168.1.0/24 (prefix must be /20-/32)'
    });
  }

  try {
    const subnet = await prisma.subnet.create({
      data: { name, cidr }
    });
    res.status(201).json(subnet);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Subnet name or CIDR already exists' });
    }
    console.error('Error creating subnet:', error);
    res.status(500).json({ error: 'Failed to create subnet' });
  }
});

// PUT update subnet (admin only)
router.put('/subnets/:id', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;
  const { name, cidr } = req.body;

  // Validate CIDR if provided
  if (cidr && !parseCidr(cidr)) {
    return res.status(400).json({
      error: 'Invalid CIDR format. Use notation like 192.168.1.0/24 (prefix must be /20-/32)'
    });
  }

  try {
    const subnet = await prisma.subnet.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(cidr && { cidr })
      }
    });
    res.json(subnet);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Subnet name or CIDR already exists' });
    }
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Subnet not found' });
    }
    console.error('Error updating subnet:', error);
    res.status(500).json({ error: 'Failed to update subnet' });
  }
});

// DELETE subnet (admin only)
router.delete('/subnets/:id', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;

  try {
    await prisma.subnet.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Subnet not found' });
    }
    console.error('Error deleting subnet:', error);
    res.status(500).json({ error: 'Failed to delete subnet' });
  }
});

// ============ SUBNETS - IP RANGE ============

// GET all IPs in a subnet with their asset links
router.get('/subnets/:id/ips', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;

  try {
    // Fetch subnet
    const subnet = await prisma.subnet.findUnique({ where: { id } });
    if (!subnet) {
      return res.status(404).json({ error: 'Subnet not found' });
    }

    // Expand CIDR to all IPs
    const ips = expandCidr(subnet.cidr);
    if (ips.length === 0) {
      return res.status(400).json({ error: 'Invalid CIDR or no host IPs available' });
    }

    // Fetch all AssetIP entries whose IPs are in the range
    const assetIPsInRange = await prisma.assetIP.findMany({
      where: {
        ip: {
          in: ips
        }
      },
      include: {
        asset: {
          select: {
            id: true,
            itemNumber: true,
            model: true,
            hostname: true,
            assignedTo: true,
            status: true
          }
        }
      }
    });

    // Build a map of IP -> (asset + label) for quick lookup
    const ipToAssetMap = new Map(assetIPsInRange.map(assetIP => [
      assetIP.ip,
      { asset: assetIP.asset, label: assetIP.label }
    ]));

    // Build response: each IP with its linked asset, label, or null
    const ipData = ips.map(ip => ({
      ip,
      asset: ipToAssetMap.get(ip)?.asset ?? null,
      label: ipToAssetMap.get(ip)?.label ?? null
    }));

    res.json({ subnet, ips: ipData });
  } catch (error) {
    console.error('Error fetching subnet IPs:', error);
    res.status(500).json({ error: 'Failed to fetch subnet IPs' });
  }
});

export default router;
