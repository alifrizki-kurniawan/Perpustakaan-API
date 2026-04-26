const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { require: true },
});

// ==========================================
// 1. CRUD & SEARCH (Authors, Categories, Books)
// ==========================================

// GET Books (with Search by Title)
app.get('/api/books', async (req, res) => {
  const { title } = req.query;
  let query = 'SELECT * FROM books';
  let params = [];
  if (title) {
    query += ' WHERE title ILIKE $1';
    params.push(`%${title}%`);
  }
  const { rows } = await pool.query(query, params);
  res.json(rows);
});

// Contoh CRUD: Delete Book
app.delete('/api/books/:id', async (req, res) => {
  await pool.query('DELETE FROM books WHERE id = $1', [req.params.id]);
  res.json({ message: "Buku berhasil dihapus" });
});

// ==========================================
// 2. ENDPOINT PENGEMBALIAN BUKU (Return Logic)
// ==========================================
app.post('/api/loans/return/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); // Mulai Transaksi
    
    // 1. Update status peminjaman
    const loanRes = await client.query(
      `UPDATE loans SET status = 'RETURNED', return_date = CURRENT_DATE 
       WHERE id = $1 AND status = 'BORROWED' RETURNING book_id`,
      [req.params.id]
    );

    if (loanRes.rows.length === 0) throw new Error("Transaksi tidak ditemukan atau sudah dikembalikan");

    const bookId = loanRes.rows[0].book_id;

    // 2. Tambah stok buku (available_copies)
    await client.query(
      'UPDATE books SET available_copies = available_copies + 1 WHERE id = $1',
      [bookId]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: "Buku berhasil dikembalikan dan stok diperbarui" });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// ==========================================
// 3. ENDPOINT LAPORAN (Statistics)
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
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 1. Endpoint Authors (Search by name)
// ==========================================
app.get('/api/authors', async (req, res) => {
  try {
    const { name } = req.query; // Mengambil query param ?name=
    let query = 'SELECT * FROM authors';
    let params = [];

    if (name) {
      query += ' WHERE name ILIKE $1';
      params.push(`%${name}%`); // Mencari nama yang mengandung kata tersebut
    }

    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 2. Endpoint Categories (Search by name)
// ==========================================
app.get('/api/categories', async (req, res) => {
  try {
    const { name } = req.query; // Mengambil query param ?name=
    let query = 'SELECT * FROM categories';
    let params = [];

    if (name) {
      query += ' WHERE name ILIKE $1';
      params.push(`%${name}%`);
    }

    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 3. Endpoint Books (Search by title)
// ==========================================
app.get('/api/books', async (req, res) => {
  try {
    const { title } = req.query; // Mengambil query param ?title=
    let query = 'SELECT * FROM books';
    let params = [];

    if (title) {
      query += ' WHERE title ILIKE $1';
      params.push(`%${title}%`);
    }

    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = app;