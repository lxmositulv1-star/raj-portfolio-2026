const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Database Connected Successfully!'))
  .catch((err) => console.log('Database Connection Error: ', err));

const keySchema = new mongoose.Schema({
  keyName: String,
  keyValue: { type: String, required: true, unique: true },
  expiryDate: Date,
  deviceLimit: { type: Number, default: 1 },
  deviceId: { type: String, default: "" },
  status: { type: String, default: "Active" },
  createdDate: { type: Date, default: Date.now }
});

const Key = mongoose.model('Key', keySchema);

app.post('/api/verify-key', async (req, res) => {
  const { keyValue, deviceId } = req.body;

  if (!keyValue || !deviceId) {
    return res.status(400).json({ success: false, message: "Key and Device ID are required!" });
  }

  try {
    const keyData = await Key.findOne({ keyValue });

    if (!keyData) {
      return res.json({ success: false, message: "Invalid Key!" });
    }

    if (keyData.status === "Banned") {
      return res.json({ success: false, message: "This Key is Banned!" });
    }

    if (keyData.status === "Expired" || new Date() > new Date(keyData.expiryDate)) {
      return res.json({ success: false, message: "Key has Expired!" });
    }

    if (keyData.deviceId === "") {
      keyData.deviceId = deviceId;
      await keyData.save();
    } else if (keyData.deviceId !== deviceId) {
      return res.json({ success: false, message: "Device ID mismatch! Key locked to another device." });
    }

    return res.json({ success: true, message: "Key Verified Successfully!" });

  } catch (error) {
    return res.status(500).json({ success: false, message: "Server Error: " + error.message });
  }
});

app.get('/', (req, res) => {
  res.send('Key Auth Server is Running Live!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
