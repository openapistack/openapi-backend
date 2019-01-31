# OpenAPI Backend Express Mock API Example
[![License](http://img.shields.io/:license-mit-blue.svg)](http://anttiviljami.mit-license.org)

Example mock API project using [openapi-backend](https://github.com/anttiviljami/openapi-backend) on [Express](https://expressjs.com/)

## QuickStart

```
npm install
npm run dev # API running at http://localhost:9091
```

Try the endpoints:

```bash
curl -i http://localhost:9091/pets
curl -i http://localhost:9091/pets/1
curl -i -X POST -d {} http://localhost:9091/pets
```

