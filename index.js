require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup bot with polling
const TOKEN = process.env.BOT_TOKEN;
const GROUP_CHAT_ID = parseInt(process.env.GROUP_CHAT_ID); // Ensure it's a number
const bot = new TelegramBot(TOKEN, { polling: true });

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Mongo Schema
const requestSchema = new mongoose.Schema({
  chatId: String,
  username: String,
  imageUrl: String,
  messageId: Number,
  forwardedMessageId: Number,
  status: { type: String, default: "Processing" },
  createdAt: { type: Date, default: Date.now }
});
const Request = mongoose.model("Request", requestSchema);

// Start Command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  const welcomeMessage = "🎨 *Welcome to Ghibli Art Generator!* 🎨\n\n"
    + "Send me an image, and I'll transform it into a Ghibli-style artwork! 🌸\n\n"
    + "✨ *How It Works:* ✨\n"
    + "1️⃣ Send an image 📸\n"
    + "2️⃣ Wait for processing ⏳\n"
    + "3️⃣ Receive your Ghibli-style artwork! 🎨\n\n"
    + "Use the buttons below to get started! ⬇️";

  const options = {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📸 Send an Image", callback_data: "send_image" }],
        [{ text: "ℹ️ Help", callback_data: "help" }],
        [{ text: "📊 Check Status", callback_data: "status" }]
      ]
    }
  };

  bot.sendMessage(chatId, welcomeMessage, options);
});

// Help Command
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, "ℹ️ Instructions:\n1. Send an image to this bot.\n2. Wait for processing.\n3. Get your Ghibli-style art back! ✨");
});

// Status Command
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  const request = await Request.findOne({ chatId }).sort({ createdAt: -1 });

  if (request) {
    bot.sendMessage(chatId, `📊 Status: ${request.status}\nImage: ${request.imageUrl}`);
  } else {
    bot.sendMessage(chatId, "No request found. Please send an image first.");
  }
});

// Inline Button Actions
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data === "send_image") {
    bot.sendMessage(chatId, "📸 Please send an image, and I'll process it for you!");
  } else if (data === "help") {
    bot.sendMessage(chatId, "ℹ️ *How to Use the Bot:*\n\n"
      + "1️⃣ Send me an image 📷\n"
      + "2️⃣ I'll process it manually ⏳\n"
      + "3️⃣ You'll receive a Ghibli-style artwork! 🎨", { parse_mode: "Markdown" });
  } else if (data === "status") {
    bot.sendMessage(chatId, "📊 Checking your request status...\n\nUse `/status` to get the latest update!");
  }

  bot.answerCallbackQuery(query.id);
});

// Handle incoming images and forward to group
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;

  if (chatId === GROUP_CHAT_ID) return;

  const username = msg.chat.username || "Unknown User";
  const fileId = msg.photo[msg.photo.length - 1].file_id;

  bot.sendMessage(chatId, "✅ Image received! Processing... 🎨");

  // Forward to group
  bot.forwardMessage(GROUP_CHAT_ID, chatId, messageId).then(async (sentMsg) => {
    const fileLink = await bot.getFileLink(fileId);
    const newRequest = new Request({
      chatId,
      username,
      imageUrl: fileLink,
      messageId,
      forwardedMessageId: sentMsg.message_id
    });
    await newRequest.save();

    console.log(`📤 New image forwarded to group: ${fileLink}`);
  });
});

// Handle processed images from group replies
bot.on('photo', async (msg) => {
  if (msg.chat.id === GROUP_CHAT_ID) {
    const repliedMessage = msg.reply_to_message;
    if (repliedMessage) {
      const forwardedMsgId = repliedMessage.message_id;
      const request = await Request.findOne({ forwardedMessageId: forwardedMsgId });

      if (request) {
        bot.sendPhoto(request.chatId, msg.photo[msg.photo.length - 1].file_id, {
          caption: "✨ Here is your Ghibli-style artwork! 🎨 Enjoy!"
        });

        await Request.findOneAndUpdate({ forwardedMessageId: forwardedMsgId }, { status: "Completed" });

        console.log(`✅ Processed image sent to bot chat: ${request.chatId}`);
      }
    }
  }
});

// Basic route for health check (for Render or other hosts)
app.get('/', (req, res) => {
  res.send("✨ Ghibli Art Generator Bot is running!");
});

// Start server
app.listen(PORT, () => {
  console.log(`🌐 Server is running on http://localhost:${PORT}`);
});
