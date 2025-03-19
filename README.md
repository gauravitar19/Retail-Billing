# Retail Billing System

A web-based retail billing system built with Next.js, TypeScript, and Tailwind CSS.

## Features

- **Admin Panel**: Manage inventory items (add, remove, list)
- **Billing Interface**: Create bills for customers
- **Real-time Inventory Management**: Stock levels are automatically updated
- **Bill Generation**: Generate and print customer bills
- **Responsive Design**: Works on desktop and mobile devices

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd retail-billing-app
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Run the development server:
```bash
npm run dev
# or
yarn dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Admin Panel

1. Navigate to `/admin` to access the admin panel
2. Add new items with name, price, and quantity
3. View and manage inventory items
4. Delete items as needed

### Billing Interface

1. Navigate to `/billing` to access the billing interface
2. Add items to the cart
3. Review the cart and total
4. Generate a bill
5. Print the generated bill

## Deployment

This application can be easily deployed to Vercel:

1. Push your code to a GitHub repository
2. Go to [Vercel](https://vercel.com) and sign in with GitHub
3. Import your repository
4. Deploy

## Notes

- This application uses in-memory storage for demonstration purposes
- For production use, replace with a proper database (MongoDB, PostgreSQL, etc.)
- Consider adding authentication for the admin panel
- Implement error handling and proper validation

## License

MIT
