import app from './app';
const port = Number(process.env.PORT ?? 10000);

app.listen(port, () => {
  console.log(`WebAPI is running on port ${port}`);
});
