const axios = require('axios');
const config = require('../../config');

const CARTOON_API = 'https://sinhala-cartoons-api.vercel.app/api';
const PENDING_TTL_MS = 5 * 60 * 1000; // 5 minutes

const pending = new Map();

/**
 * Search cartoons
 */
async function searchCartoons(query, site = 'sinhalacartoons', page = 1) {
  try {
    console.log(`[CARTOON_SEARCH] Query: ${query}, Site: ${site}, Page: ${page}`);
    
    const res = await axios.get(`${CARTOON_API}/search`, {
      params: {
        site: site,
        q: query,
        page: page || 1,
      },
      timeout: 30000,
      validateStatus: () => true,
    });

    console.log(`[CARTOON_SEARCH] Status: ${res.status}`);

    if (res.status !== 200) {
      throw new Error(
        res.data?.error || res.data?.message || `HTTP ${res.status}`
      );
    }

    if (!res.data?.success && res.data?.error) {
      throw new Error(res.data.error);
    }

    const results = res.data?.results || [];
    if (!Array.isArray(results)) {
      throw new Error('Invalid API response format');
    }

    console.log(`[CARTOON_SEARCH] Found ${results.length} results`);
    return results;
  } catch (err) {
    console.error(`[CARTOON_SEARCH] Error:`, err.message);
    throw err;
  }
}

/**
 * Get cartoon details & download links
 */
async function getCartoonDetails(postUrl) {
  try {
    console.log(`[CARTOON_DETAILS] Fetching: ${postUrl.substring(0, 80)}...`);
    
    const res = await axios.get(`${CARTOON_API}/details`, {
      params: { url: postUrl },
      timeout: 30000,
      validateStatus: () => true,
    });

    console.log(`[CARTOON_DETAILS] Status: ${res.status}`);

    if (res.status !== 200) {
      throw new Error(
        res.data?.error || res.data?.message || `HTTP ${res.status}`
      );
    }

    if (!res.data?.success && res.data?.error) {
      throw new Error(res.data.error);
    }

    const details = res.data?.data || res.data;
    console.log(`[CARTOON_DETAILS] Got details:`, {
      title: details.title?.substring(0, 50),
      downloadLinks: details.downloadLinks?.length || 0,
    });

    return details;
  } catch (err) {
    console.error(`[CARTOON_DETAILS] Error:`, err.message);
    throw err;
  }
}

/**
 * Resolve final download link
 */
async function resolveDownloadLink(pageLink) {
  try {
    console.log(`[CARTOON_DOWNLOAD] Resolving: ${pageLink.substring(0, 80)}...`);
    
    const res = await axios.get(`${CARTOON_API}/download`, {
      params: { url: pageLink },
      timeout: 30000,
      validateStatus: () => true,
    });

    console.log(`[CARTOON_DOWNLOAD] Status: ${res.status}`);

    if (res.status !== 200) {
      throw new Error(
        res.data?.error || res.data?.message || `HTTP ${res.status}`
      );
    }

    const linkData = res.data?.data || res.data;
    console.log(`[CARTOON_DOWNLOAD] Resolved:`, {
      downloadUrl: linkData.downloadUrl?.substring(0, 50),
      fileSize: linkData.fileSize,
    });

    return linkData;
  } catch (err) {
    console.error(`[CARTOON_DOWNLOAD] Error:`, err.message);
    throw err;
  }
}

module.exports = {
  name: 'cartoon',
  aliases: ['ct', 'toon', 'animes'],
  description: 'Search & watch Sinhala cartoons',
  category: 'entertainment',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    // ===== CHECK IF SELECTING FROM SEARCH RESULTS =====
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const idx = parseInt(args[0], 10) - 1;
      const p = pending.get(from);

      if (!p || !p.results?.length) {
        return sock.sendMessage(
          from,
          { text: `❌ Active search නැහැ.\n💡 \`${prefix}cartoon <name>\`` },
          { quoted: msg }
        );
      }

      if (idx < 0 || idx >= p.results.length) {
        return sock.sendMessage(
          from,
          { text: `❌ *1*–*${p.results.length}* තෝරන්න.` },
          { quoted: msg }
        );
      }

      const selected = p.results[idx];
      clearTimeout(p.timeout);
      pending.delete(from);

      // Fetch details for selected cartoon
      const loading = await sock.sendMessage(
        from,
        { text: '📥 *තොරතුරු ලබාගනිමින්...*' },
        { quoted: msg }
      );

      try {
        const details = await getCartoonDetails(selected.url);
        const title = details.title || selected.title || 'Cartoon';
        const image = details.image || selected.image || null;
        const description = details.description || selected.description || 'N/A';
        const downloadLinks = details.downloadLinks || [];

        let msg_text = `╭───「 📺 *CARTOON* 」───╮\n│\n│  📌 *${String(title).slice(0, 50)}*\n│\n`;

        if (description && description !== 'N/A') {
          msg_text += `│  📝 ${String(description).slice(0, 60)}\n│\n`;
        }

        if (downloadLinks.length === 0) {
          await sock
            .sendMessage(from, { delete: loading.key })
            .catch(() => {});
          return sock.sendMessage(from, {
            text: `❌ No download links found for this cartoon.`,
          });
        }

        // Store download links for next selection
        const linksPending = {
          links: downloadLinks.map((link, i) => ({
            index: i + 1,
            label: link.label || link.name || `Link ${i + 1}`,
            url: link.url || link,
          })),
          timeout: setTimeout(() => pending.delete(from), PENDING_TTL_MS),
        };
        pending.set(from, linksPending);

        msg_text += `│  🔗 *Download Links*:\n│\n`;

        downloadLinks.forEach((link, i) => {
          const label = link.label || link.name || `Link ${i + 1}`;
          msg_text += `│  *${i + 1}.* ${String(label).slice(0, 40)}\n`;
        });

        msg_text += `│\n│  👇 \`${prefix}cartoon <number>\`\n│  ⏳ 5 min\n╰──────────────────────╯`;

        await sock
          .sendMessage(from, { delete: loading.key })
          .catch(() => {});

        if (image && /^https?:\/\//i.test(image)) {
          try {
            await sock.sendMessage(
              from,
              { image: { url: image }, caption: msg_text },
              { quoted: msg }
            );
            return;
          } catch (_) {}
        }

        await sock.sendMessage(from, { text: msg_text }, { quoted: msg });
      } catch (err) {
        console.error('[CARTOON] Details error:', err.message);
        await sock
          .sendMessage(from, {
            text: `❌ තොරතුරු ලබා ගැනීම සම්බන්ධයි:\n\`${err.message}\``,
            edit: loading.key,
          })
          .catch(() => {});
      }
      return;
    }

    // ===== CHECK IF SELECTING A DOWNLOAD LINK =====
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const idx = parseInt(args[0], 10) - 1;
      const p = pending.get(from);

      if (p?.links && p.links.length) {
        const selected = p.links[idx];

        if (idx < 0 || idx >= p.links.length) {
          return sock.sendMessage(
            from,
            { text: `❌ *1*–*${p.links.length}* තෝරන්න.` },
            { quoted: msg }
          );
        }

        const loading = await sock.sendMessage(
          from,
          { text: '⏳ *Download link resolve කරමින්...*' },
          { quoted: msg }
        );

        try {
          const resolved = await resolveDownloadLink(selected.url);
          const downloadUrl = resolved.downloadUrl || resolved.url;
          const fileSize = resolved.fileSize || 'Unknown';

          await sock
            .sendMessage(from, { delete: loading.key })
            .catch(() => {});

          let response = `╭───「 📥 *DOWNLOAD* 」───╮\n│\n`;
          response += `│  📌 ${String(selected.label).slice(0, 50)}\n│\n`;
          response += `│  📦 *Size:* ${fileSize}\n│\n`;
          response += `│  🔗 *Link:*\n`;
          response += `│  ${downloadUrl}\n│\n`;
          response += `╰──────────────────────╯`;

          clearTimeout(p.timeout);
          pending.delete(from);

          return sock.sendMessage(from, { text: response }, { quoted: msg });
        } catch (err) {
          console.error('[CARTOON] Download resolve error:', err.message);
          await sock
            .sendMessage(from, {
              text: `❌ Link resolve fail:\n\`${err.message}\``,
              edit: loading.key,
            })
            .catch(() => {});
        }
      }
    }

    // ===== SHOW HELP IF NO ARGS =====
    if (!args.length) {
      return sock.sendMessage(
        from,
        {
          text: `╭───「 📺 *CARTOON* 」───╮
│
│  ${prefix}cartoon <name>
│  ${prefix}cartoon latest
│
│  Example:
│  ${prefix}cartoon Ben 10
│  ${prefix}cartoon latest
│
╰──────────────────────╯`,
        },
        { quoted: msg }
      );
    }

    // ===== HANDLE "latest" KEYWORD =====
    if (args[0].toLowerCase() === 'latest') {
      const loading = await sock.sendMessage(
        from,
        { text: '🔍 *Latest cartoons හොයමින්...*' },
        { quoted: msg }
      );

      try {
        const res = await axios.get(`${CARTOON_API}/latest`, {
          params: { site: 'sinhalacartoons', page: 1 },
          timeout: 30000,
          validateStatus: () => true,
        });

        if (res.status !== 200 || !res.data?.results?.length) {
          return sock.sendMessage(from, {
            text: `❌ Latest cartoons load fail.`,
            edit: loading.key,
          });
        }

        const results = res.data.results.slice(0, 10);
        const existing = pending.get(from);
        if (existing?.timeout) clearTimeout(existing.timeout);
        const timeout = setTimeout(() => pending.delete(from), PENDING_TTL_MS);
        pending.set(from, { results, timeout });

        let list = `╭───「 📺 *LATEST CARTOONS* 」───╮\n│\n`;
        results.forEach((item, i) => {
          list += `│  *${i + 1}.* ${String(item.title).slice(0, 45)}\n`;
        });
        list += `│\n│  👇 \`${prefix}cartoon <number>\`\n│  ⏳ 5 min\n╰──────────────────────╯`;

        await sock
          .sendMessage(from, { delete: loading.key })
          .catch(() => {});

        if (results[0]?.image) {
          try {
            await sock.sendMessage(
              from,
              { image: { url: results[0].image }, caption: list },
              { quoted: msg }
            );
            return;
          } catch (_) {}
        }

        await sock.sendMessage(from, { text: list }, { quoted: msg });
      } catch (err) {
        console.error('[CARTOON] Latest error:', err.message);
        await sock
          .sendMessage(from, {
            text: `❌ \`${err.message}\``,
            edit: loading.key,
          })
          .catch(() => {});
      }
      return;
    }

    // ===== SEARCH FOR CARTOON =====
    const query = args.join(' ').trim();
    const loading = await sock.sendMessage(
      from,
      { text: '🔍 *Cartoon හොයමින්...*' },
      { quoted: msg }
    );

    try {
      const results = await searchCartoons(query);

      if (!results.length) {
        return sock.sendMessage(from, {
          text: '❌ Results හමු නොවීය.',
          edit: loading.key,
        });
      }

      const cleaned = results.slice(0, 10).map((r, i) => ({
        index: i + 1,
        title: r.title || 'Untitled',
        url: r.url || r.link,
        image: r.image || r.thumb || null,
        description: r.description || null,
      }));

      const existing = pending.get(from);
      if (existing?.timeout) clearTimeout(existing.timeout);
      const timeout = setTimeout(() => pending.delete(from), PENDING_TTL_MS);
      pending.set(from, { results: cleaned, timeout });

      let list = `╭───「 📺 *CARTOON SEARCH* 」───╮\n│\n│  🔎 *${query.slice(0, 35)}*\n│\n`;

      cleaned.forEach((item) => {
        list += `│  *${item.index}.* ${String(item.title).slice(0, 45)}\n`;
      });

      list += `│\n│  👇 \`${prefix}cartoon <number>\`\n│  ⏳ 5 min\n╰──────────────────────╯`;

      await sock
        .sendMessage(from, { delete: loading.key })
        .catch(() => {});

      if (cleaned[0]?.image) {
        try {
          await sock.sendMessage(
            from,
            { image: { url: cleaned[0].image }, caption: list },
            { quoted: msg }
          );
          return;
        } catch (_) {}
      }

      await sock.sendMessage(from, { text: list }, { quoted: msg });
    } catch (err) {
      console.error('[CARTOON] Search error:', err.message);
      await sock
        .sendMessage(from, {
          text: `❌ Search fail.\n\`${err.message}\``,
          edit: loading.key,
        })
        .catch(() => {});
    }
  },
};
