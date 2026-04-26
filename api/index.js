const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());

// Konfigurasi Database Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { require: true },
});

// 1. Rute Utama untuk cek status API
app.get('/', (req, res) => {
  res.send('API Perpustakaan Kelompok 57 - Modul 4 Berhasil Berjalan!');
});

// ==========================================
// 2. FITUR PENCARIAN & CRUD (Authors, Categories, Books)
// ==========================================

// --- AUTHORS ---
app.get('/api/authors', async (req, res) => {
  const { name } = req.query;
  const query = name ? 'SELECT * FROM authors WHERE name ILIKE $1' : 'SELECT * FROM authors';
  const params = name ? [`%${name}%`] : [];
  const { rows } = await pool.query(query, params);
  res.json({ success: true, data: rows });
});

app.post('/api/authors', async (req, res) => {
  const { name } = req.body;
  const { rows } = await pool.query('INSERT INTO authors (name) VALUES ($1) RETURNING *', [name]);
  res.status(201).json({ success: true, data: rows[0] });
});

app.delete('/api/authors/:id', async (req, res) => {
  await pool.query('DELETE FROM authors WHERE id = $1', [req.params.id]);
  res.json({ success: true, message: "Author berhasil dihapus" });
});

// --- CATEGORIES ---
app.get('/api/categories', async (req, res) => {
  const { name } = req.query;
  const query = name ? 'SELECT * FROM categories WHERE name ILIKE $1' : 'SELECT * FROM categories';
  const params = name ? [`%${name}%`] : [];
  const { rows } = await pool.query(query, params);
  res.json({ success: true, data: rows });
});

app.post('/api/categories', async (req, res) => {
  const { name } = req.body;
  const { rows } = await pool.query('INSERT INTO categories (name) VALUES ($1) RETURNING *', [name]);
  res.status(201).json({ success: true, data: rows[0] });
});

// --- BOOKS ---
app.get('/api/books', async (req, res) => {
  const { title } = req.query;
  const query = title ? 'SELECT * FROM books WHERE title ILIKE $1' : 'SELECT * FROM books';
  const params = title ? [`%${title}%`] : [];
  const { rows } = await pool.query(query, params);
  res.json({ success: true, data: rows });
});

// ==========================================
// 3. ENDPOINT PENGEMBALIAN BUKU (Return Logic)
// ==========================================
app.post('/api/loans/return/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); // Memulai transaksi database

    // 1. Cek dan update status pinjaman
    const loanRes = await client.query(
      `UPDATE loans SET status = 'RETURNED', return_date = CURRENT_DATE 
       WHERE id = $1 AND status = 'BORROWED' RETURNING book_id`,
      [req.params.id]
    );

    if (loanRes.rows.length === 0) {
      throw new Error("Transaksi tidak ditemukan atau buku sudah dikembalikan sebelumnya.");
    }

    const bookId = loanRes.rows[0].book_id;

    // 2. Tambah kembali stok buku otomatis
    await client.query(
      'UPDATE books SET available_copies = available_copies + 1 WHERE id = $1',
      [bookId]
    );

    await client.query('COMMIT'); // Simpan perubahan jika semua sukses
    res.json({ success: true, message: "Buku berhasil dikembalikan dan stok diperbarui secara otomatis." });
  } catch (err) {
    await client.query('ROLLBACK'); // Batalkan semua jika ada satu saja yang gagal
    res.status(400).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// ==========================================
// 4. ENDPOINT LAPORAN: STATISTIK PERPUSTAKAAN
// ==========================================
app.get('/api/reports/stats', async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM books) as total_books,
        (SELECT COUNT(*) FROM authors) as total_authors,
        (SELECT COUNT(*) FROM categories) as total_categories,
        (SELECT COUNT(*) FROM loans WHERE status = 'BORROWED') as active_loans
    `;
    const { rows } = await pool.query(statsQuery);
    res.json({
      success: true,
      data: {
        total_buku: parseInt(rows[0].total_books),
        total_penulis: parseInt(rows[0].total_authors),
        total_kategori: parseInt(rows[0].total_categories),
        pinjaman_aktif: parseInt(rows[0].active_loans)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// WAJIB: Baris ini harus selalu di paling bawah
module.exports = app;