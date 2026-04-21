const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { User }   = require('../models');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { name, username, email, password, role } = req.body;
        if (!name?.trim())       return res.status(400).json({ error: 'Name is required' });
        if (!email?.trim())      return res.status(400).json({ error: 'Email is required' });
        if (!password)           return res.status(400).json({ error: 'Password is required' });
        if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) return res.status(400).json({ error: 'Invalid email format' });

        const existingEmail = await User.findOne({ email: email.toLowerCase().trim() });
        if (existingEmail) return res.status(409).json({ error: 'Email is already registered' });

        if (username?.trim()) {
            const existingUsername = await User.findOne({ username: username.trim() });
            if (existingUsername) return res.status(409).json({ error: 'Username is already taken' });
        }

        const validRoles   = ['ADMIN', 'MANAGER', 'VENDOR'];
        const assignedRole = validRoles.includes(role) ? role : 'MANAGER';
        const hashed       = await bcrypt.hash(password, 10);

        const user = await User.create({
            name:     name.trim(),
            username: username?.trim() || null,
            email:    email.toLowerCase().trim(),
            password: hashed,
            role:     assignedRole
        });

        return res.status(201).json({ success: true, userId: user._id });
    } catch (err) {
        console.error('[REGISTER ERROR]', err);
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern || {})[0] || 'field';
            return res.status(409).json({ error: `${field} is already in use` });
        }
        return res.status(500).json({ error: 'Registration failed: ' + err.message });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) return res.status(401).json({ error: 'No account found with this email' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: 'Incorrect password' });

        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );

        return res.json({ token, userId: user._id, name: user.name, role: user.role, email: user.email });
    } catch (err) {
        console.error('[LOGIN ERROR]', err);
        return res.status(500).json({ error: 'Login failed: ' + err.message });
    }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found' });
        return res.json(user);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/auth/users
router.get('/users', authenticate, async (req, res) => {
    try {
        const users = await User.find().select('_id name username email role createdAt').sort({ name: 1 });
        return res.json(users);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// DELETE /api/auth/users/:id — Admin only
router.delete('/users/:id', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Access denied. Admin only.' });
        }

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Prevent admin from deleting themselves
        if (String(user._id) === String(req.user._id || req.user.id)) {
            return res.status(400).json({ error: 'You cannot delete your own account' });
        }

        await user.deleteOne();
        return res.json({ success: true, message: `User "${user.name}" deleted successfully` });
    } catch (err) {
        console.error('[DELETE USER ERROR]', err);
        return res.status(500).json({ error: 'Delete failed: ' + err.message });
    }
});

// POST /api/auth/admin-reset-password — Admin only
router.post('/admin-reset-password', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Access denied. Admin only.' });
        }

        const { userId, newPassword } = req.body;
        if (!userId || !newPassword) {
            return res.status(400).json({ error: 'userId and newPassword are required' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        return res.json({ success: true, message: `Password reset for "${user.name}"` });
    } catch (err) {
        console.error('[ADMIN RESET PASSWORD ERROR]', err);
        return res.status(500).json({ error: 'Password reset failed: ' + err.message });
    }
});

module.exports = router;