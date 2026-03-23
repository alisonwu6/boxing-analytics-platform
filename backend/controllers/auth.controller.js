const { PrismaClient } = require('../generated/prisma');
const { hashPassword } = require('../services/auth.service');

const prisma = new PrismaClient();

async function register(req, res) {
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

module.exports = {
  register,
};