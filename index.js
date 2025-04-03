require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

const TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const GROUP_CHAT_ID = -1002555257261;
const bot = new TelegramBot(TOKEN, { polling: true });

// Connect to MongoDB
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("Connected to MongoDB"))
    .catch(err => console.error("MongoDB connection error:", err));

// Define Request Schema
const requestSchema = new mongoose.Schema({
    chatId: String,
    username: String,
    imageUrl: String,
    messageId: Number,
    forwardedMessageId: Number, // Store forwarded message ID
    status: { type: String, default: "Processing" },
    createdAt: { type: Date, default: Date.now }
});

const Request = mongoose.model("Request", requestSchema);


bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    const welcomeMessage = "🎨 *Welcome to Ghible Art Generator!* 🎨\n\n"
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


// Help command
bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, "Instructions:\n1. Send an image to this bot.\n2. Wait for processing.\n3. Get your Ghibli-style art back! ✨");
});

// Status command
bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    const request = await Request.findOne({ chatId }).sort({ createdAt: -1 });

    if (request) {
        bot.sendMessage(chatId, `Status: ${request.status}\nImage: ${request.imageUrl}`);
    } else {
        bot.sendMessage(chatId, "No request found. Please send an image first.");
    }
});

//Handle Button Clicks
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
        bot.sendMessage(chatId, "📊 Checking your request status...\n\n"
            + "Use `/status` to get the latest update!");
    }

    bot.answerCallbackQuery(query.id);
});

// Handle incoming images and forward to group
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const username = msg.chat.username || "Unknown User";
    const fileId = msg.photo[msg.photo.length - 1].file_id;

    // Prevent re-forwarding of processed images
    if (chatId === GROUP_CHAT_ID) return; // Ignore images sent inside the group

    bot.sendMessage(chatId, "Image received! Processing... 🎨");

    // Forward the image to the group and capture the forwarded message ID
    bot.forwardMessage(GROUP_CHAT_ID, chatId, messageId).then(async (sentMessage) => {
        // Save request with both original and forwarded message IDs
        const fileLink = await bot.getFileLink(fileId);
        const newRequest = new Request({
            chatId,
            username,
            imageUrl: fileLink,
            messageId,  // Store original bot chat message ID
            forwardedMessageId: sentMessage.message_id  // Store the forwarded message ID
        });
        await newRequest.save();

        console.log(`New request forwarded to group: ${fileLink}`);
    });
});

// Handle processed images from the group and send back to the bot's chat with the user
bot.on('photo', async (msg) => {
    if (msg.chat.id === GROUP_CHAT_ID) { // Only process images from the group
        const repliedMessage = msg.reply_to_message;
        
        if (repliedMessage) {
            const repliedToMessageId = repliedMessage.message_id;

            // Find the original request in MongoDB using the forwarded message ID
            const request = await Request.findOne({ forwardedMessageId: repliedToMessageId });

            if (request) {
                bot.sendPhoto(request.chatId, msg.photo[msg.photo.length - 1].file_id, 
                    { caption: "✨ Here is your Ghibli-style artwork! 🎨 Enjoy!" });

                // Update status in MongoDB
                await Request.findOneAndUpdate({ forwardedMessageId: repliedToMessageId }, { status: "Completed" });

                console.log(`Processed image sent to bot chat: ${request.chatId}`);
            }
        }
    }
});

console.log('Ghible Art Generator bot is running...');
