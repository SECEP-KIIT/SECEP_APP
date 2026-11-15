import express from 'express';
import routes from './routes/index.js';

const app = express();

app.use(express.json());
app.use(routes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Express recognises error handlers by their 4-argument signature, so `_next` must stay.
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'Internal server error' });
});

export default app;
