const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      autoIndex: true,
    });
    console.log(`[JCMS DB] MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.warn(`\n========================================`);
    console.warn(`[JCMS DB WARNING] Local MongoDB not running: ${error.message}`);
    console.warn(`[JCMS DB WARNING] Running in fallback IN-MEMORY database mode.`);
    console.warn(`[JCMS DB WARNING] Registration & login will work in memory (non-persistent).`);
    console.warn(`[JCMS DB WARNING] Set a real MONGODB_URI in .env to enable persistence.`);
    console.warn(`========================================\n`);
  }
};

module.exports = connectDB;
