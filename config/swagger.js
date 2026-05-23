const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "SplitEase API",
      version: "1.0.0",
      description: `
## SplitEase — Group Expense Management API

SplitEase is a full-stack expense splitting platform that helps groups track shared
costs and settle debts efficiently.

### Key Features
- **JWT + Google OAuth authentication** with Redis-backed session management
- **Flexible expense splitting** — Equal, Percentage, or Custom split modes
- **Debt Simplification** — Minimum Cash Flow algorithm reduces required settlement
  transactions by up to 40% compared to naive pairwise settlement
- **Multi-currency support** — INR, USD, EUR, GBP, JPY with daily exchange-rate sync
- **Real-time notifications** — Socket.IO events via Redis Pub/Sub
- **Redis caching** — Per-route TTL caching for dashboard and expense queries

### Authentication
All protected endpoints require a **Bearer token** in the \`Authorization\` header:
\`\`\`
Authorization: Bearer <your_jwt_token>
\`\`\`
Obtain a token via \`POST /api/auth/login\` or Google OAuth.
      `,
      contact: {
        name: "Tirthoraj Bhattacharya",
        url: "https://github.com/CodeTirtho97/SplitEase_backend",
      },
    },
    servers: [
      {
        url: process.env.BACKEND_URL || "http://localhost:5000",
        description: "Local development server",
      },
      {
        url: "https://splitease-backend.onrender.com",
        description: "Production server (Render)",
      },
    ],
    tags: [
      {
        name: "Auth",
        description:
          "User registration, login, logout, Google OAuth, and password reset",
      },
      {
        name: "Profile",
        description:
          "User profile management — picture upload, friends, payment methods",
      },
      {
        name: "Groups",
        description:
          "Group creation and management, plus the debt simplification summary endpoint",
      },
      {
        name: "Expenses",
        description:
          "Create and manage shared expenses with Equal/Percentage/Custom splits",
      },
      {
        name: "Transactions",
        description: "View pending debts, history, and settle payments",
      },
      {
        name: "Dashboard",
        description:
          "Aggregated stats, recent transactions, and cache management",
      },
      {
        name: "Health",
        description: "Infrastructure health checks for MongoDB, Redis, and system info",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "JWT token obtained from /api/auth/login or Google OAuth callback",
        },
      },
      schemas: {
        // ── Core models ────────────────────────────────────────────────────
        User: {
          type: "object",
          properties: {
            _id: { type: "string", example: "64b1f2c8e4b0a12345678901" },
            fullName: { type: "string", example: "Tirthoraj Bhattacharya" },
            email: { type: "string", example: "user@example.com" },
            gender: {
              type: "string",
              enum: ["Male", "Female", "Other"],
              example: "Male",
            },
            profilePic: {
              type: "string",
              nullable: true,
              example: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
            },
            friends: {
              type: "array",
              items: { $ref: "#/components/schemas/UserRef" },
            },
            paymentMethods: {
              type: "array",
              items: { $ref: "#/components/schemas/PaymentMethod" },
            },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        UserRef: {
          type: "object",
          description: "Minimal user reference used inside nested objects",
          properties: {
            _id: { type: "string", example: "64b1f2c8e4b0a12345678901" },
            fullName: { type: "string", example: "Jane Doe" },
            email: { type: "string", example: "jane@example.com" },
          },
        },
        PaymentMethod: {
          type: "object",
          properties: {
            methodType: {
              type: "string",
              enum: ["UPI", "PayPal", "Stripe"],
              example: "UPI",
            },
            accountDetails: { type: "string", example: "user@upi" },
          },
        },
        Group: {
          type: "object",
          properties: {
            _id: { type: "string", example: "64b1f2c8e4b0a12345678902" },
            name: { type: "string", example: "Goa Trip 2024" },
            description: {
              type: "string",
              example: "Beach holiday expenses",
            },
            type: {
              type: "string",
              enum: ["Travel", "Household", "Event", "Work", "Friends"],
              example: "Travel",
            },
            completed: { type: "boolean", example: false },
            createdBy: { $ref: "#/components/schemas/UserRef" },
            members: {
              type: "array",
              items: { $ref: "#/components/schemas/UserRef" },
            },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Expense: {
          type: "object",
          properties: {
            _id: { type: "string", example: "64b1f2c8e4b0a12345678903" },
            groupId: { type: "string", example: "64b1f2c8e4b0a12345678902" },
            payer: { $ref: "#/components/schemas/UserRef" },
            totalAmount: { type: "number", example: 1500 },
            currency: {
              type: "string",
              enum: ["INR", "USD", "EUR", "GBP", "JPY"],
              example: "INR",
            },
            description: { type: "string", example: "Hotel booking" },
            type: {
              type: "string",
              enum: [
                "Food",
                "Transportation",
                "Accommodation",
                "Utilities",
                "Entertainment",
                "Miscellaneous",
              ],
              example: "Accommodation",
            },
            splitMethod: {
              type: "string",
              enum: ["Equal", "Percentage", "Custom"],
              example: "Equal",
            },
            expenseStatus: { type: "boolean", example: false },
            participants: {
              type: "array",
              items: { $ref: "#/components/schemas/UserRef" },
            },
            splitDetails: {
              type: "array",
              items: { $ref: "#/components/schemas/SplitDetail" },
            },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        SplitDetail: {
          type: "object",
          properties: {
            userId: { $ref: "#/components/schemas/UserRef" },
            amountOwed: { type: "number", example: 500 },
            percentage: { type: "number", example: 33.33 },
            transactionId: {
              type: "string",
              nullable: true,
              description: "Set once the debt is settled",
            },
          },
        },
        Transaction: {
          type: "object",
          properties: {
            transactionId: {
              type: "string",
              description: "bcrypt-hashed opaque identifier",
              example: "$2a$10$xyz...",
            },
            expenseName: { type: "string", example: "Hotel booking" },
            groupName: { type: "string", example: "Goa Trip 2024" },
            owedFrom: { type: "string", example: "Tirthoraj" },
            amount: { type: "number", example: 500 },
            currency: {
              type: "string",
              enum: ["INR", "USD", "EUR", "GBP", "JPY"],
              example: "INR",
            },
            date: { type: "string", format: "date", example: "2024-06-01" },
          },
        },
        // ── Debt Simplification ────────────────────────────────────────────
        Settlement: {
          type: "object",
          description: "A single optimised payment in the simplified debt plan",
          properties: {
            from: { $ref: "#/components/schemas/UserRef" },
            to: { $ref: "#/components/schemas/UserRef" },
            amount: {
              type: "number",
              description: "Amount to be transferred",
              example: 750,
            },
          },
        },
        DebtSummary: {
          type: "object",
          properties: {
            message: { type: "string" },
            group: {
              type: "object",
              properties: {
                _id: { type: "string" },
                name: { type: "string" },
                type: { type: "string" },
              },
            },
            originalTransactionCount: {
              type: "integer",
              description: "Number of raw pending transactions before optimisation",
              example: 6,
            },
            optimizedTransactionCount: {
              type: "integer",
              description: "Minimum transactions needed after simplification",
              example: 3,
            },
            reductionPercentage: {
              type: "integer",
              description: "Percentage reduction in transaction count",
              example: 50,
            },
            optimizedSettlements: {
              type: "array",
              items: { $ref: "#/components/schemas/Settlement" },
            },
            settlementSummary: {
              type: "array",
              items: { type: "string" },
              description: "Human-readable settlement instructions",
              example: ["Alice pays Bob ₹750", "Charlie pays Alice ₹250"],
            },
          },
        },
        // ── Auth / responses ───────────────────────────────────────────────
        AuthResponse: {
          type: "object",
          properties: {
            message: { type: "string", example: "Login successful" },
            token: {
              type: "string",
              description: "JWT token valid for 7 days",
              example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            },
            user: { $ref: "#/components/schemas/User" },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            message: { type: "string", example: "Descriptive error message" },
          },
        },
        ValidationError: {
          type: "object",
          properties: {
            message: { type: "string", example: "Validation failed" },
            errors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  field: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
        // ── Dashboard ──────────────────────────────────────────────────────
        DashboardStats: {
          type: "object",
          properties: {
            totalGroups: { type: "integer", example: 3 },
            totalMembers: { type: "integer", example: 12 },
            settledPayments: { type: "number", example: 4500 },
            pendingPayments: { type: "number", example: 1200 },
            totalExpenses: { type: "number", example: 8000 },
            groupExpenses: { type: "number", example: 6000 },
          },
        },
        HealthStatus: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["healthy", "degraded", "error"],
              example: "healthy",
            },
            timestamp: { type: "string", format: "date-time" },
            uptime: { type: "number", example: 3600.5 },
            services: {
              type: "object",
              properties: {
                mongodb: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "connected" },
                    readyState: { type: "integer", example: 1 },
                  },
                },
                redis: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "connected" },
                    isReady: { type: "boolean", example: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [
    "./routes/authRoutes.js",
    "./routes/profileRoutes.js",
    "./routes/groupRoutes.js",
    "./routes/expenseRoutes.js",
    "./routes/transactionRoutes.js",
    "./routes/dashboardRoutes.js",
    "./routes/healthRoutes.js",
  ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
