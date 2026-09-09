import app from './index.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.listen(PORT, () => {
  console.log(`CampusFlow API running at http://localhost:${PORT}`);
});