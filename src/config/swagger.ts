import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "JobPilot API",
      version: "1.0.0",
      description: "Job discovery, matching, and automation system",
    },
    servers: [{ url: "http://localhost:3000", description: "Local dev" }],
  },
  apis: ["./src/routes/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);