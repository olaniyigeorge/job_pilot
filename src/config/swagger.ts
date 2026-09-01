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
    components: {
      schemas: {
        ProfileInput: {
          type: "object",
          required: ["firstName", "lastName"],
          properties: {
            firstName: { type: "string", example: "Olaniyi" },
            lastName: { type: "string", example: "George" },
            headline: { type: "string", example: "Software Engineer" },
            summary: { type: "string", example: "Backend engineer focused on automation and AI." },
            yearsOfExperience: { type: "integer", example: 6 },
          },
        },
        Profile: {
          type: "object",
          properties: {
            id: { type: "integer" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            headline: { type: "string", nullable: true },
            summary: { type: "string", nullable: true },
            yearsOfExperience: { type: "integer", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
  },
  apis: ["./src/routes/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);