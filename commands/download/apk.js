const axios = require('axios');

const API_BASE = 'https://whiteshadow-x-api.onrender.com/api/download/apkmody';
const API_TOKEN = 'CkExxE'; 
const FOOTER = 'RED DEVIL AND ZAYRA DEV';

module.exports = {
  name: 'apk',
  aliases: ['apkmody', 'modapk', 'getapk'],
  description: 'Search & download APK / MOD APK from APKMody',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const query = args.join(' ').trim();

    if (!query) {
      const helpText = `
*╭─┉❰ 📱 𝐀𝐏𝐊 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐑 📱 ❱┉─┉──•*
*│*
*│* 🔍 *Usage ›* \`.apk <app name>\`
*│* 📌 *Example ›* \`.apk subway surfers\`
*│* 📌 *Example ›* \`.apk free fire\`
*│*
*╰──────────────────┉*
> ${FOOTER}
`.trim();
      return sock.sendMessage(from, { text: helpText }, { quoted: msg });
    }

    // Loading message
    const loading = await sock.sendMessage(
      from,
      {
        text: `*╭─┉❰ 🔍 𝐒𝐄𝐀𝐑𝐂𝐇𝐈𝐍𝐆 🔍 ❱┉─┉──•*\n*│*\n*│* 📱 *Query ›* \`${query}\`\n*│* ⏳ Please wait...\n*│*\n*╰──────────────────┉*`,
      },
      { quoted: msg }
    );

    try {
      const { data } = await axios.get(API_BASE, {
        params: {
          q: query,
          auto: true,
          apitoken: API_TOKEN,
        },
        timeout: 45000,
      });

      if (!data?.status || !data?.result) {
        throw new Error(data?.message || 'No results found');
      }

      const r = data.result;
      const download = r.downloads?.[0];

      if (!download?.url) {
        throw new Error('Download link not available');
      }

      // Fancy result card
      const caption = `
*╭─┉❰ 📱 𝐀𝐏𝐊 𝐅𝐎𝐔𝐍𝐃 📱 ❱┉─┉──•*
*│*
*│◊│* ✦ 🎮 *Title* › ${r.title || 'Unknown'}
*│◊│* ✦ 📦 *Package* › \`${r.package || 'N/A'}\`
*│◊│* ✦ 🔢 *Version* › ${r.version || 'N/A'}
*│◊│* ✦ ⚡ *Mod* › ${r.mod || 'Original'}
*│◊│* ✦ 📂 *Type* › ${r.type || 'apk'}
*│◊│* ✦ 💾 *Size* › ${download.size || 'N/A'}
*│◊│* ✦ 📅 *Updated* › ${r.updated ? new Date(r.updated).toLocaleDateString('en-GB') : 'N/A'}
*│*
*│◊│* 📥 *File* › \`${download.fileName || 'app.apk'}\`
*│*
*╰──────────────────┉*

*╭━━〔 💬 𝐍𝐎𝐓𝐈𝐂𝐄 〕━━⬣*
*│◊│* ⬇️ Downloading APK now...
*│◊│* ⚠️ Large files may take time
*╰━━━━━━━━━━━━━━⬣*

> ${FOOTER}
`.trim();

      // Send icon + info
      if (r.icon) {
        await sock.sendMessage(
          from,
          {
            image: { url: r.icon },
            caption,
          },
          { quoted: msg }
        );
      } else {
        await sock.sendMessage(from, { text: caption }, { quoted: msg });
      }

      // Delete loading message (best effort)
      try {
        await sock.sendMessage(from, { delete: loading.key });
      } catch (_) {}

      // Send the APK document
      await sock.sendMessage(
        from,
        {
          document: { url: download.url },
          mimetype: 'application/vnd.android.package-archive',
          fileName: download.fileName || `${r.title || 'app'}.apk`,
          caption: `✅ *${r.title}*\n📦 ${download.size || ''}\n\n> ${FOOTER}`,
        },
        { quoted: msg }
      );
    } catch (err) {
      console.error('APK command error:', err.message);

      const errText = `
*╭─┉❰ ❌ 𝐄𝐑𝐑𝐎𝐑 ❌ ❱┉─┉──•*
*│*
*│* 🔍 Query › \`${query}\`
*│* ⚠️ ${err.message || 'Something went wrong'}
*│*
*│* 💡 Try another name or check spelling
*│*
*╰──────────────────┉*
> ${FOOTER}
`.trim();

      try {
        await sock.sendMessage(
          from,
          { text: errText, edit: loading.key },
          { quoted: msg }
        );
      } catch {
        await sock.sendMessage(from, { text: errText }, { quoted: msg });
      }
    }
  },
};
