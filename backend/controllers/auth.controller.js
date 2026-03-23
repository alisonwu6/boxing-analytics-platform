const { PrismaClient } = require('../generated/prisma');
const { hashPassword, verifyPassword } = require('../services/auth.service');
const { signToken } = require('../utils/jwt');

const prisma = new PrismaClient();

async function register (req, res) {
  try {
    const { email, password, name } = req.body;

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
      },
    });

    res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to register user' });
  }
}

async function login (req, res) {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const valid = await verifyPassword(password, user.passwordHash);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = signToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login failed' });
  }
}

module.exports = {
  register,
  login
};