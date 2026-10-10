const http = require('http');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://admin:YOUR_PASSWORD@cluster0.xxxx.mongodb.net/gema-boutique?retryWrites=true&w=majority";

// Connect to MongoDB Atlas
mongoose.connect(MONGO_URI)
    .then(() => console.log('Connected to MongoDB Atlas successfully!'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Define Mongoose Product Schema & Model
const productSchema = new mongoose.Schema({
    title: { type: String, required: true },
    price: { type: String, required: true },
    numericPrice: Number,
    quantity: { type: Number, default: 1 },
    category: { type: String, required: true },
    spec: String,
    stockStatus: { type: String, default: 'In Stock' },
    active: { type: Boolean, default: true },
    imageUrl: { type: String, required: true },
    tag: { type: String, default: 'Standard' }
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

function parseNumericPrice(priceStr) {
    if (!priceStr) return 0;
    const digits = priceStr.toString().replace(/[^0-9]/g, '');
    return parseInt(digits, 10) || 0;
}

let activeSessions = {};

function parseCookies(req) {
    const list = {};
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
        cookieHeader.split(';').forEach(cookie => {
            let [name, ...rest] = cookie.split('=');
            name = name?.trim();
            if (!name) return;
            let value = rest.join('=').trim();
            if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
            try { list[name] = decodeURIComponent(value); } catch (e) { list[name] = value; }
        });
    }
    return list;
}

const server = http.createServer((req, res) => {
    const cookies = parseCookies(req);
    const sessionId = cookies.gema_session;
    const isLoggedIn = sessionId && activeSessions[sessionId];

    const urlParts = req.url.split('?')[0];

    if (urlParts === '/gema-login' && req.method === 'GET') {
        fs.readFile(path.join(__dirname, 'private', 'login.html'), (err, content) => {
            if (err) { res.writeHead(404); res.end('Login page missing'); }
            else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(content); }
        });
        return;
    }

    if (urlParts === '/api/login' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const { username, password } = JSON.parse(body);
                if (username === 'gema admin' && password === 'gema2026') {
                    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
                    activeSessions[token] = true;
                    res.writeHead(200, {
                        'Set-Cookie': `gema_session=${token}; HttpOnly; Path=/`,
                        'Content-Type': 'application/json'
                    });
                    res.end(JSON.stringify({ success: true }));
                } else {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Incorrect username or password' }));
                }
            } catch (e) {
                res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid request' }));
            }
        });
        return;
    }

    if (urlParts === '/api/logout' && req.method === 'POST') {
        if (sessionId) delete activeSessions[sessionId];
        res.writeHead(200, {
            'Set-Cookie': 'gema_session=; Max-Age=0; Path=/',
            'Content-Type': 'application/json'
        });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    if (urlParts === '/gema-secure-dashboard-77x' && req.method === 'GET') {
        if (!isLoggedIn) {
            res.writeHead(302, { 'Location': '/gema-login' });
            res.end();
            return;
        }
        fs.readFile(path.join(__dirname, 'private', 'admin.html'), (err, content) => {
            if (err) { res.writeHead(404); res.end('Admin file missing'); }
            else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(content); }
        });
        return;
    }

    if (urlParts === '/api/products' && req.method === 'GET') {
        Product.find({}).sort({ createdAt: -1 })
            .then(products => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(products));
            })
            .catch(err => {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to fetch inventory' }));
            });
        return;
    }

    if (urlParts === '/api/products' && req.method === 'POST') {
        if (!isLoggedIn) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized session.' }));
            return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const rawPrice = data.price || '0';
                const formattedPrice = rawPrice.toString().toUpperCase().includes('KSH') ? rawPrice : `Ksh ${rawPrice}`;
                const numPrice = parseNumericPrice(rawPrice);
                const qty = parseInt(data.quantity, 10) || 1;

                const newProduct = new Product({
                    title: data.title,
                    price: formattedPrice,
                    numericPrice: numPrice,
                    quantity: qty,
                    category: data.category,
                    spec: data.spec,
                    stockStatus: qty > 0 ? (data.stockStatus || 'In Stock') : 'Out of Stock',
                    active: qty > 0,
                    imageUrl: data.imageUrl,
                    tag: data.tag || 'Standard'
                });

                await newProduct.save();
                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Product published successfully!' }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to process item upload' }));
            }
        });
        return;
    }

    if (urlParts.startsWith('/api/products/') && req.method === 'PATCH') {
        if (!isLoggedIn) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized session.' }));
            return;
        }

        const id = urlParts.split('/')[3];
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const updates = JSON.parse(body);
                if (updates.quantity !== undefined) {
                    const qty = parseInt(updates.quantity, 10);
                    updates.quantity = qty;
                    if (qty <= 0 || updates.active === false) {
                        updates.stockStatus = 'Out of Stock';
                        updates.active = false;
                    } else {
                        updates.stockStatus = 'In Stock';
                        updates.active = true;
                    }
                }

                const updatedProduct = await Product.findByIdAndUpdate(id, updates, { new: true });
                if (updatedProduct) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, product: updatedProduct }));
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Product not found' }));
                }
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid update request' }));
            }
        });
        return;
    }

    if (urlParts.startsWith('/api/products/') && req.method === 'DELETE') {
        if (!isLoggedIn) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized session.' }));
            return;
        }

        const id = urlParts.split('/')[3];
        Product.findByIdAndDelete(id)
            .then(deleted => {
                if (deleted) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Item deleted permanently' }));
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Product not found' }));
                }
            })
            .catch(err => {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to delete product' }));
            });
        return;
    }

    let filePath = path.join(__dirname, 'public', urlParts === '/' ? 'index.html' : urlParts);
    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

    fs.readFile(filePath, (error, content) => {
        if (error) {
            fs.readFile(path.join(__dirname, 'public', 'index.html'), (err, fallbackContent) => {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(fallbackContent, 'utf-8');
            });
        } else {
            res.writeHead(200, { 'Content-Type': mimeTypes[extname] || 'application/octet-stream' });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`Gema Boutique server running at http://localhost:${PORT}`);
});