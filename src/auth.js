const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_fresher_party_key_2026_xyz';

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function authenticate(req, res, next) {
  let token = null;

  // 1. Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // 2. Cookie fallback
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  // 3. Query param fallback (for quick links or tests)
  if (!token && req.query && req.query.auth_token) {
    token = req.query.auth_token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please login.' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired session. Please login again.' });
  }

  req.user = decoded;
  next();
}

function requireAdmin(req, res, next) {
  authenticate(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Admin privileges required.' });
    }
    next();
  });
}

function requireVolunteerOrAdmin(req, res, next) {
  authenticate(req, res, () => {
    if (req.user.role !== 'admin' && req.user.role !== 'volunteer') {
      return res.status(403).json({ error: 'Access denied: Volunteer or Admin privileges required.' });
    }
    next();
  });
}

module.exports = {
  generateToken,
  verifyToken,
  authenticate,
  requireAdmin,
  requireVolunteerOrAdmin
};

