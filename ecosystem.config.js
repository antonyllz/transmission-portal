module.exports = {
  apps: [
    {
      name: 'transmission-portal-api',
      script: 'server/server.js',
      env: { PORT: 5455 },
    },
    {
      name: 'transmission-portal',
      script: 'server/public-server.js',
      env: { PUBLIC_PORT: 5454, API_PORT: 5455 },
    },
  ],
};
