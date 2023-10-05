import { SSTConfig } from "sst";
import { OpenAPI } from "./stacks/OpenAPIStack";

export default {
  config(_input) {
    return {
      name: "openapi-backend-sst-sample",
      region: "us-east-1",
    };
  },
  stacks(app) {
    app.stack(OpenAPI);
  },
} satisfies SSTConfig;
