# OpenAPI Backend JWT Auth Example
[![License](http://img.shields.io/:license-mit-blue.svg)](http://anttiviljami.mit-license.org)

Example project using [openapi-backend](https://github.com/openapistack/openapi-backend) on [Express](https://expressjs.com/)

## QuickStart

```
npm install
npm start # API running at http://localhost:9000
```

Try the endpoints:

```bash
curl -i http://localhost:9000/login
curl -i http://localhost:9000/me -H "Authorization: <token>"
```

