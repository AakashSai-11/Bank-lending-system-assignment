# 💰 Bank Lending System - Assignment Project

This project is a **Bank Lending System** built using **Node.js**, **Express.js**, and **SQLite** to simulate the core backend functionalities of a loan management platform.

---

## 🧾 Features Implemented

- 👤 **Customer creation API**
  - Create new customers with a unique `customer_id` and name.

- 💸 **Loan Creation API**
  - Assign loans to customers with principal amount, interest rate, loan period (in years), and monthly EMI calculation.

- 🧾 **Payment Recording API**
  - Record customer payments:
    - **EMI**: Standard monthly installment
    - **LUMP_SUM**: Bulk repayment to reduce outstanding balance and EMIs

- 📊 **Loan Ledger API**
  - View complete loan ledger:
    - Total paid, balance, remaining EMIs
    - All transactions with type, date, and amount

- 📋 **Customer Overview API**
  - For a given customer, shows:
    - All loans
    - Principal, interest, paid amount, remaining amount
    - EMIs left for each loan

 **NOTE** : This code assumes that while creating a new loan, the customer already exists in the Customers database table, so please make sure that before creating a new loan, insert the customer details in Customers database table.

---

## 📁 Project Structure

```bash
bank-lending-system-assignment/
│
├── app.js                 # Main Express application
├── bankDatabase.db        # SQLite database file
├── package.json
└── README.md              
