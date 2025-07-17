// KODE LENGKAP DAN FINAL UNTUK api/bot.js
const TelegramBot = require('node-telegram-bot-api');

// --- PENGATURAN PENTING ---
const TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const VERCEL_URL = process.env.VERCEL_URL;

const TRIAL_DAYS = 1;

// --- Pemeriksaan Variabel Lingkungan ---
if (!TOKEN || !ADMIN_CHAT_ID || !ADMIN_USERNAME || !VERCEL_URL) {
  console.error("Salah satu Environment Variables (TOKEN, ADMIN_ID, ADMIN_USERNAME, VERCEL_URL) tidak diatur!");
  throw new Error("Missing required environment variables");
}

const bot = new TelegramBot(TOKEN);

// --- DATABASE SIMULASI ---
const users = {}; 
const userState = {};

// --- Fungsi-fungsi Helper ---
function isUserSubscribed(userId) {
    const user = users[userId];
    return !!(user && user.isSubscribed && user.subscriptionEndDate > new Date());
}

function grantSubscription(userId, days, planName = 'Premium') {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);

    if (!users[userId]) {
        users[userId] = {};
    }

    users[userId].isSubscribed = true;
    users[userId].subscriptionEndDate = expiryDate;
    users[userId].planName = planName;
    
    if (planName.includes('Trial')) {
        users[userId].claimedTrial = true;
    }
}

// --- Definisi Tombol Menu Utama ---
const inlineKeyboard = [
    [{ text: 'PROFILING PELAKU', callback_data: 'profiling_pelaku' }],
    [{ text: 'NIK TO HP', callback_data: 'nik_to_hp' }],
    [{ text: 'HP TO NIK', callback_data: 'hp_to_nik' }],
    [{ text: 'BTS TRACKING', callback_data: 'bts_tracking' }],
    [{ text: 'CEK NOPOL', callback_data: 'cek_nopol' }],
    [{ text: 'UPGRADE PREMIUM', callback_data: 'upgrade_premium' }],
    [{ text: 'CLAIM PAKET TRIAL', callback_data: 'request_trial' }], 
    [{ text: 'HUBUNGI KAMI', callback_data: 'support' }, { text: 'PROFIL SAYA', callback_data: 'my_profile' }],
];

// --- Handler Utama untuk Vercel ---
module.exports = async (req, res) => {
    try {
        bot.processUpdate(req.body);
        res.status(200).send('OK');
    } catch (error) {
        console.error("Error di handler utama:", error);
        res.status(500).send('Internal Server Error');
    }
};

// =================================================================
// SEMUA LOGIKA BOT (EVENT LISTENERS) ADA DI BAWAH INI
// =================================================================

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const photoUrl = 'https://blogger.googleusercontent.com/img/a/AVvXsEjRLr6ekcCjF3P_96jiM4RXKNllMQUJCmMmDK5F7fM1dhvM8tMSQm8N5NbQNAnUKe9HNjkGebfA6fGboBrgjuTaYfu7Gt4fTv3uuiaqRU8BSUw4Xigb9swvktpHBszuT-AIiamiEDibbLBZkMbWsPS3Dp8ragmVG63b3y9CiKN9seYxgYPB4587Uodp0bIR';
    const captionText = `
*Lacak Lokasi Bot*

*Panduan Penggunaan*
• Pilih layanan dari menu di bawah
• Untuk akses fitur, silakan upgrade ke premium
• Hubungi admin untuk bantuan

*Developed with ❤️ by @${ADMIN_USERNAME}*

--- *PILIH LAYANAN DIBAWAH INI* ---
    `;
    bot.sendPhoto(chatId, photoUrl, {
        caption: captionText,
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: inlineKeyboard
        }
    }).catch(err => {
        console.error("Gagal mengirim foto, mengirim teks sebagai fallback:", err.message);
        bot.sendMessage(chatId, captionText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: inlineKeyboard } });
    });
});

bot.onText(/\/grant (\d+) (\d+)/, (msg, match) => {
    if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;
    const targetUserId = parseInt(match[1], 10);
    const days = parseInt(match[2], 10);
    if (isNaN(targetUserId) || isNaN(days)) {
        bot.sendMessage(ADMIN_CHAT_ID, "Format salah. Gunakan: `/grant <USER_ID> <JUMLAH_HARI>`");
        return;
    }
    grantSubscription(targetUserId, days);
    bot.sendMessage(ADMIN_CHAT_ID, `✅ Berhasil! Pengguna \`${targetUserId}\` telah diberikan akses premium selama ${days} hari.`);
    bot.sendMessage(targetUserId, `🎉 *Selamat!* Akun Anda telah di-upgrade oleh admin dan aktif selama *${days} hari*.`).catch(err => console.error(err));
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    if (!text || text.startsWith('/')) return;

    if (userState[userId] === 'awaiting_trial_reason') {
        delete userState[userId];
        const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
        const approvalMessage = `📝 *Permintaan Trial Baru*\n\n*Dari*: ${username}\n*User ID*: \`${userId}\`\n\n*Alasan/Kronologi*:\n${text}`;
        bot.sendMessage(ADMIN_CHAT_ID, approvalMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '✅ Setujui', callback_data: `approve_trial_${userId}` },
                    { text: '❌ Tolak', callback_data: `reject_trial_${userId}` }
                ]]
            }
        }).catch(err => console.error("Gagal kirim ke admin:", err));
        bot.sendMessage(userId, "✅ Terima kasih. Permintaan trial Anda telah dikirim ke admin untuk ditinjau.");
        return;
    }
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const action = query.data;
    const messageId = query.message.message_id;

    if (action.startsWith('approve_trial_') || action.startsWith('reject_trial_')) {
        if (userId.toString() !== ADMIN_CHAT_ID) return bot.answerCallbackQuery(query.id, { text: 'Aksi ini hanya untuk admin!', show_alert: true });
        
        const parts = action.split('_');
        const decision = parts[0];
        const targetUserId = parseInt(parts[2], 10);

        if (decision === 'approve') {
            grantSubscription(targetUserId, TRIAL_DAYS, 'Bronze (Trial)');
            bot.sendMessage(targetUserId, `🎉 *Selamat!* Permintaan trial Anda disetujui.\n\nAnda mendapatkan akses *Paket Bronze (Trial)* selama *${TRIAL_DAYS} hari*.`).catch(err => console.error(err));
            bot.editMessageText(`✅ *DISETUJUI*: Trial untuk user \`${targetUserId}\` telah diaktifkan.`, { chat_id: ADMIN_CHAT_ID, message_id: messageId, parse_mode: 'Markdown' });
        } else {
            bot.sendMessage(targetUserId, `Mohon maaf, permintaan trial Anda belum disetujui. Silakan hubungi admin atau pilih paket berbayar.`).catch(err => console.error(err));
            bot.editMessageText(`❌ *DITOLAK*: Permintaan trial untuk user \`${targetUserId}\`.`, { chat_id: ADMIN_CHAT_ID, message_id: messageId, parse_mode: 'Markdown' });
        }
        return bot.answerCallbackQuery(query.id);
    }
    
    bot.answerCallbackQuery(query.id);

    switch (action) {
        case 'upgrade_premium':
            const user = users[userId] || {};
            let upgradeButtons = [[{ text: 'Bronze - Rp 150.000', callback_data: 'paket_bronze' }]];
            if (!user.claimedTrial) {
                upgradeButtons.unshift([{ text: '🎁 Dapatkan Trial Gratis (Paket Bronze)', callback_data: 'request_trial' }]);
            }
            bot.sendMessage(chatId, '⭐ *Pilih Paket Premium Anda* ⭐', { reply_markup: { inline_keyboard: upgradeButtons } });
            break;

        case 'request_trial':
            if (users[userId] && users[userId].claimedTrial) {
                return bot.sendMessage(chatId, "Anda sudah pernah mengambil trial.");
            }
            userState[userId] = 'awaiting_trial_reason';
            bot.sendMessage(chatId, "✍️ Untuk mengklaim trial, silakan jelaskan *kronologi atau alasan* Anda memerlukan trial ini dalam satu pesan balasan.");
            break;

        case 'my_profile':
            const userStatus = isUserSubscribed(userId);
            let profileText = `*Profil Anda*\n\n👤 User ID: \`${userId}\`\n⭐ Status: *${userStatus ? 'Premium' : 'Gratis'}*`;
            if (userStatus) {
                const u = users[userId];
                profileText += `\n🏷️ Paket Aktif: *${u.planName}*`;
                profileText += `\n\nLangganan berakhir pada:\n*${new Date(u.subscriptionEndDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}*`;
            }
            bot.sendMessage(chatId, profileText, { parse_mode: 'Markdown' });
            break;

        case 'support':
            bot.sendMessage(chatId, `Untuk dukungan atau bantuan, silakan hubungi admin.`, {
                reply_markup: { inline_keyboard: [[{ text: 'Hubungi Admin', url: `https://t.me/${ADMIN_USERNAME}` }]] }
            });
            break;
            
        default:
            const freeAccessActions = ['my_profile', 'support', 'upgrade_premium', 'request_trial', 'paket_bronze'];
            if (freeAccessActions.includes(action)) break;

            if (!isUserSubscribed(userId)) {
                bot.sendMessage(chatId, '❗ *Akses Ditolak*\n\nFitur ini khusus untuk pengguna premium.', {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: 'UPGRADE PREMIUM', callback_data: 'upgrade_premium' }]] }
                });
            } else {
                bot.sendMessage(chatId, "Fitur premium sedang dalam pengembangan.");
            }
            break;
    }
});
