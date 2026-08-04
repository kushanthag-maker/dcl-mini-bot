const axios = require('axios');

module.exports = {
  name: 'news',
  aliases: ['adaderana', 'n'],
  description: 'Ada Derana latest news',
  category: 'utility',
  async execute({ sock, msg, from, args }) {
    try {
      // Loading message
      const loading = await sock.sendMessage(from, { 
        text: '📰 *පුවත් ලබාගනිමින්...*' 
      }, { quoted: msg });

      // ===== LIST MODE =====
      if (!args[0]) {
        const { data } = await axios.get('https://adaderana-news-api.vercel.app/api/news');

        if (!data.status || !data.results?.length) {
          return sock.sendMessage(from, { 
            text: '❌ පුවත් ලබාගත නොහැකි විය.',
            edit: loading.key 
          });
        }

        const newsList = data.results.slice(0, 10);
        let text = `╭───「 📰 *ADA DERANA* 」───╮\n│\n`;

        newsList.forEach((item, i) => {
          const cleanTitle = item.title.replace(/\n|\t/g, ' ').trim();
          text += `│  *${i + 1}.* ${cleanTitle}\n│\n`;
        });

        text += `│  💡 *.news <number>* ලෙස type කරන්න\n│     උදා: .news 3\n│\n`;
        text += `╰──────────────────────╯`;

        return sock.sendMessage(from, {
          text: text.trim(),
          edit: loading.key
        });
      }

      // ===== DETAIL MODE =====
      const index = parseInt(args[0]);
      if (isNaN(index) || index < 1 || index > 10) {
        return sock.sendMessage(from, {
          text: '❌ වලංගු අංකයක් ඇතුළත් කරන්න.\nඋදා: *.news 1*',
          edit: loading.key
        });
      }

      // Get list again to find the correct URL
      const { data: listData } = await axios.get('https://adaderana-news-api.vercel.app/api/news');
      const selected = listData.results[index - 1];

      if (!selected) {
        return sock.sendMessage(from, {
          text: '❌ ඒ අංකයට අදාළ පුවතක් හමු නොවීය.',
          edit: loading.key
        });
      }

      // Get full details
      const { data: detail } = await axios.get(
        `https://adaderana-news-api.vercel.app/api/news-detail?url=${encodeURIComponent(selected.url)}`
      );

      if (!detail.status || !detail.data) {
        return sock.sendMessage(from, {
          text: '❌ පුවත් විස්තර ලබාගත නොහැකි විය.',
          edit: loading.key
        });
      }

      const news = detail.data;
      const title = news.title.replace(/\n|\t/g, ' ').trim();
      let fullNews = news.full_news || 'විස්තර නොමැත.';

      // Truncate if too long (WhatsApp limit)
      if (fullNews.length > 3500) {
        fullNews = fullNews.substring(0, 3500) + '...\n\n🔗 Read more: ' + news.source_url;
      }

      const caption = `
╭───「 📰 *NEWS DETAIL* 」───╮
│
│  *${title}*
│
│  📅 ${news.time !== 'N/A' ? news.time : '—'}
│
│  ${fullNews}
│
│  🔗 ${news.source_url}
│
╰──────────────────────╯
`.trim();

      // Delete loading message
      await sock.sendMessage(from, { delete: loading.key }).catch(() => {});

      // Send with image if available
      if (news.image) {
        await sock.sendMessage(from, {
          image: { url: news.image },
          caption: caption
        }, { quoted: msg });
      } else {
        await sock.sendMessage(from, {
          text: caption
        }, { quoted: msg });
      }

    } catch (err) {
      console.error(err);
      await sock.sendMessage(from, {
        text: '❌ දෝෂයක් ඇතිවිය. නැවත උත්සාහ කරන්න.'
      }, { quoted: msg });
    }
  },
};
