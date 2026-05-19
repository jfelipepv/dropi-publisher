const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const publicPath = path.join(process.cwd(), 'public');
app.use(express.static(publicPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

const SITES = {
  co: { domain: 'dropi.co', country: 'Colombia' },
  ar: { domain: 'dropi.ar', country: 'Argentina' },
  mx: { domain: 'dropi.mx', country: 'México' },
  cl: { domain: 'dropi.cl', country: 'Chile' },
  ec: { domain: 'dropi.ec', country: 'Ecuador' },
  pe: { domain: 'dropi.pe', country: 'Perú' },
  py: { domain: 'dropi.com.py', country: 'Paraguay' },
  gt: { domain: 'dropi.gt', country: 'Guatemala' },
};

const SLUGS = {
  co: 'colombia', ar: 'argentina', mx: 'mexico',
  cl: 'chile', ec: 'ecuador', pe: 'peru',
  py: 'paraguay', gt: 'guatemala'
};

function rep(str, country, id) {
  if (!str) return str;
  const slug = SLUGS[id] || country.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return str.replace(/\[PAÍS\]/gi, country).replace(/\[pais\]/gi, slug);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Dropi Publisher Pro funcionando correctamente' });
});

app.post('/publish', async (req, res) => {
  const { siteId, username, password, post } = req.body;

  if (!siteId || !username || !password || !post) {
    return res.status(400).json({ success: false, error: 'Faltan campos requeridos' });
  }

  const site = SITES[siteId];
  if (!site) {
    return res.status(400).json({ success: false, error: 'Sitio no reconocido: ' + siteId });
  }

  const creds = Buffer.from(`${username}:${password.replace(/\s/g, '')}`).toString('base64');
  const base = `https://${site.domain}/wp-json/wp/v2`;

  try {
    let catId = 1;
    try {
      const catRes = await fetch(`${base}/categories?search=Blog&per_page=10`, {
        headers: { 'Authorization': 'Basic ' + creds }
      });
      if (catRes.ok) {
        const cats = await catRes.json();
        const match = cats.find(c => c.name.toLowerCase() === 'blog');
        if (match) catId = match.id;
      }
    } catch (e) {}

    const title     = rep(post.title,     site.country, siteId);
    const content   = rep(post.content,   site.country, siteId);
    const slug      = rep(post.slug,      site.country, siteId);
    const seoTitle  = rep(post.seoTitle,  site.country, siteId);
    const seoDesc   = rep(post.seoDesc,   site.country, siteId);
    const keyphrase = rep(post.keyphrase, site.country, siteId);

    const postRes = await fetch(`${base}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + creds,
      },
      body: JSON.stringify({
        title,
        content: '<!-- wp:html -->' + content + '<!-- /wp:html -->',
        slug,
        status:     post.status || 'draft',
        categories: [catId],
        meta: {
          _yoast_wpseo_focuskw:  keyphrase,
          _yoast_wpseo_title:    seoTitle,
          _yoast_wpseo_metadesc: seoDesc,
        }
      }),
    });

    const data = await postRes.json();

    if (!postRes.ok) {
      return res.status(200).json({
        success: false,
        error: data.message || 'HTTP ' + postRes.status,
        site: site.domain
      });
    }

    return res.json({
      success: true,
      postId: data.id,
      url: data.link,
      site: site.domain,
      country: site.country
    });

  } catch (err) {
    return res.status(200).json({
      success: false,
      error: err.message,
      site: site.domain
    });
  }
});

app.listen(PORT, () => {
  console.log(`Dropi Publisher Pro corriendo en puerto ${PORT}`);
});
