require('dotenv').config();
const bcrypt         = require('bcryptjs');
const { connectDB }  = require('./config/database');
const { User }       = require('./models');

const NEW_PASSWORD = 'Admin@123';

async function resetPasswords() {
    try {
        await connectDB();
        const hashed = await bcrypt.hash(NEW_PASSWORD, 10);
        console.log('Generated hash:', hashed);

        await User.updateMany({}, { password: hashed });

        const users = await User.find().select('name email role');
        console.log('\n✅ All passwords reset to: Admin@123');
        console.log('\n📋 Login Credentials:\n');
        users.forEach(u => {
            console.log(`  Role: ${u.role.padEnd(10)} | Email: ${u.email.padEnd(35)} | Password: Admin@123`);
        });

        console.log('\n🚀 You can now login at http://localhost:4200');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

resetPasswords();