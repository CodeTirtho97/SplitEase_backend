# SplitEase - Expense Splitting Made Simple

![SplitEase Logo](https://res.cloudinary.com/dwukdgjhq/image/upload/v1/profile_pics/splitease-logo)

## 🚀 Overview

SplitEase is a full-stack expense management application designed to simplify the process of splitting expenses among friends, roommates, or travel groups. This repository contains the backend codebase built with Node.js, Express, and MongoDB.

[Check out the Frontend Repository](https://github.com/CodeTirtho97/SplitEase_frontend)

## ✨ Features

- **📱 User Management**

  - Register, login, and profile management
  - Social login with Google OAuth
  - Upload profile pictures to Cloudinary
  - Add and manage payment methods

- **👥 Group Management**

  - Create groups for different expense categories
  - Add/remove friends to groups
  - Track group-specific expenses

- **💸 Expense Tracking**

  - Add expenses with multiple splitting methods:
    - Equal splits
    - Percentage-based splits
    - Custom amount splits
  - Support for multiple currencies
  - Categorize expenses (Food, Transportation, etc.)

- **📊 Transaction Management**

  - View pending payments
  - Settle transactions with transaction history
  - Track payment statuses

- **📈 Dashboard Analytics**
  - Expense summaries
  - Group statistics
  - Monthly trends and category breakdowns

## 🔧 Tech Stack

### Core Technologies

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Caching**: Redis (Upstash)
- **Authentication**: JWT, Passport.js (Google OAuth)

### Key Libraries

- **Security**: bcryptjs, helmet, cors
- **File Uploads**: multer, cloudinary
- **Email**: nodemailer
- **Scheduling**: node-cron
- **Testing**: Jest, Supertest

### External Services

- **Database Hosting**: MongoDB Atlas
- **Cloud Storage**: Cloudinary
- **Redis Cache**: Upstash
- **Currency Exchange**: ExchangeRates API

## 🏗️ Architecture

SplitEase follows a robust, service-oriented architecture:

```
├── config/             # Configuration files
├── middleware/         # Express middleware
├── models/             # Mongoose models
├── routes/             # Express routes
├── services/           # Business logic
├── tests/              # Jest test suite
└── utils/              # Utility functions
```

### Key Components:

- **Models**: Define the data structure
- **Routes**: Handle HTTP requests
- **Services**: Implement business logic
- **Middleware**: Process requests (auth, validation, file uploads)

## 💾 Database Schema

SplitEase uses MongoDB with the following main collections:

- **Users**: Profile information, payment methods, friends list
- **Groups**: Group details and member references
- **Expenses**: Expense records with splitting information
- **Transactions**: Payment tracking between users
- **ExchangeRates**: Currency conversion rates (cached daily)

## 🛡️ Security Features

- **Password Hashing**: bcrypt with 12 rounds of salting
- **JWT Authentication**: 7-day expiry tokens
- **CORS Protection**: Configured for allowed origins
- **Rate Limiting**: Prevents brute-force attacks
- **Secure Headers**: Using Helmet.js
- **Password Reset**: Secure token-based process

## 📡 API Endpoints

### Authentication

- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - Login existing user
- `GET /api/auth/google/login` - Google OAuth login
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token

### Profile

- `GET /api/profile/me` - Get user profile
- `PUT /api/profile/update` - Update profile details
- `POST /api/profile/upload` - Upload profile picture
- `PUT /api/profile/change-password` - Change password
- `POST /api/profile/add-friend` - Add a friend
- `POST /api/profile/search-friends` - Search for users by name
- `POST /api/profile/add-payment` - Add payment method
- `DELETE /api/profile/delete-friend/:friendId` - Remove a friend
- `DELETE /api/profile/delete-payment/:paymentId` - Remove payment method

### Groups

- `POST /api/groups/create` - Create a new group
- `GET /api/groups/mygroups` - Get user's groups
- `GET /api/groups/:groupId` - Get group details
- `PUT /api/groups/edit/:groupId` - Edit group
- `DELETE /api/groups/delete/:groupId` - Delete group
- `GET /api/groups/friends` - Get user's friends

### Expenses

- `POST /api/expenses/create` - Create a new expense
- `GET /api/expenses/group/:groupId` - Get group expenses
- `GET /api/expenses/my-expenses` - Get user expenses
- `GET /api/expenses/expense/:expenseId` - Get expense details
- `DELETE /api/expenses/delete/:expenseId` - Delete expense
- `GET /api/expenses/summary` - Get expense summary
- `GET /api/expenses/recent` - Get recent expenses
- `GET /api/expenses/breakdown/:currency` - Get expense breakdown by category

### Transactions

- `GET /api/transactions/pending` - Get pending transactions
- `GET /api/transactions/history` - Get transaction history
- `PUT /api/transactions/:transactionId/settle` - Settle a transaction

### Dashboard

- `GET /api/stats` - Get dashboard statistics
- `GET /api/transactions/recent` - Get recent transactions

## 🚦 Getting Started

### Prerequisites

- Node.js (v14+)
- MongoDB (local or Atlas)
- Redis (optional but recommended)
- Google OAuth credentials (for social login)
- Cloudinary account (for image uploads)
- ExchangeRates API key

### Environment Variables

Create a `.env` file in the root directory with the following:

```env
PORT=5000
FRONTEND_URL=https://your-frontend-url.com
BACKEND_GOOGLE_CALLBACK_URL=https://your-backend-url.com/api/auth/google/callback
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/splitease
REDIS_URL=rediss://default:password@your-redis-url.upstash.io:6379
JWT_SECRET=your-jwt-secret-key

CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

EXCHANGE_RATE_URL=https://api.apilayer.com/exchangerates_data/latest
EXCHANGERATES_API_KEY=your-api-key
BASE_CURRENCY=INR
```

### Installation

```bash
# Clone the repository
git clone https://github.com/CodeTirtho97/SplitEase_backend.git

# Navigate to the directory
cd SplitEase_backend

# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test
```

## 🧪 Testing

SplitEase uses Jest for testing:

```bash
# Run all tests
npm test

# Run specific test file
npx jest tests/auth.test.js
```

The test suite includes:

- Authentication tests
- Profile management tests
- Group operations tests
- Expense and transaction tests

## 🔄 CI/CD Pipeline

This project supports continuous integration with:

- Jest test automation
- Custom test sequencer for dependency ordering
- In-memory MongoDB for test isolation

## 📜 License

This project is licensed under the ISC License.

## 👥 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📞 Contact

For questions or feedback, please reach out to the project maintainer:

- **GitHub**: [CodeTirtho97](https://github.com/CodeTirtho97)
- **LinkedIn**: [CodeTirtho97](https://www.linkedin.com/in/tirthoraj-bhattacharya/)
- **Twitter**: [CodeTirtho97](https://x.com/lucifer_7951)

---

Made with ❤️ by CodeTirtho97
