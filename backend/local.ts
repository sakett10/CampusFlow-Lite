import app from './index.js';

const PORT = 3000;

app.listen(PORT, (err?: unknown) => {
  if (err) {
    console.error('Failed to start API:', err);
    process.exit(1);
  }
  console.log(`CampusFlow API running at http://localhost:${PORT}`);
});