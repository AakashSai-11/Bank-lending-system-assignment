const express = require("express");
const app = express();
const { v4: uuidv4 } = require("uuid");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");
const { error } = require("console");
app.use(express.json());

const status_constants = {
  active: "ACTIVE",
  completed: "PAID_OFF",
};

const dbpath = path.join(__dirname, "bankDatabase.db");
let db = null;

const intialiseServerAndDb = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    });
    await db.exec(`
        CREATE TABLE IF NOT EXISTS Customers (
        customer_id TEXT PRIMARY KEY,
        name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS Loans (
        loan_id TEXT PRIMARY KEY,
        customer_id TEXT,
        principal_amount DECIMAL,
        total_amount DECIMAL,
        interest_rate DECIMAL,
        loan_period_years INTEGER,
        monthly_emi DECIMAL,
        status TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES Customers(customer_id)
        );

        CREATE TABLE IF NOT EXISTS Payments (
        payment_id TEXT PRIMARY KEY,
        loan_id TEXT,
        amount DECIMAL,
        payment_type TEXT,
        payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (loan_id) REFERENCES Loans(loan_id)
        );
    `);
    app.listen(3000, () => {
      console.log("Server is running at https://localhost:3000/");
    });
  } catch (e) {
    console.log(`${e.message}`);
  }
};

intialiseServerAndDb();

const valid_inputs = (req, res, next) => {
  const { customer_id, loan_amount, loan_period_years, interest_rate_yearly } =
    req.body;

  if (
    typeof customer_id !== "string" ||
    customer_id.trim().length === 0 ||
    typeof loan_amount !== "number" ||
    loan_amount <= 0 ||
    typeof loan_period_years !== "number" ||
    loan_period_years <= 0 ||
    typeof interest_rate_yearly !== "number" ||
    interest_rate_yearly <= 0
  ) {
    return res.status(400).send({ error: "Invalid input data" });
  }

  next();
};

//Extra part -> Creating customers
app.post("/api/v1/customers", async (req, res) => {
  const { name } = req.body;

  if (typeof name !== "string" || name.trim() === "") {
    return res.status(400).send({ error: "Invalid customer name" });
  }

  const customer_id = uuidv4();
  const query = `INSERT INTO Customers (customer_id, name) VALUES ('${customer_id}', '${name}')`;

  await db.run(query);
  res.send("Customer Created successfully");
});

//This is creating a loan(2.1)
app.post("/api/v1/loans", valid_inputs, async (req, res) => {
  const { customer_id, loan_amount, loan_period_years, interest_rate_yearly } =
    req.body;
  const newLoanId = uuidv4();

  const total_interest =
    loan_amount * loan_period_years * (interest_rate_yearly / 100);
  const total_amount = total_interest + loan_amount;
  const monthly_emi = total_amount / (loan_period_years * 12);

  const query = `
    INSERT INTO Loans (
      loan_id, customer_id, principal_amount, total_amount,
      interest_rate, loan_period_years, monthly_emi, status
    )
    VALUES (
      '${newLoanId}', '${customer_id}', ${loan_amount}, ${total_amount},
      ${interest_rate_yearly}, ${loan_period_years}, ${monthly_emi},
      '${status_constants.active}'
    )`;

  const final = await db.run(query);

  const result = {
    loan_id: newLoanId,
    customer_id: customer_id,
    total_amount_payable: total_amount,
    monthly_emi: monthly_emi,
  };

  res.send(result);
});

//THis is Recording a Payment(2.2)
app.post("/api/v1/loans/:loanId/payments", async (req, res) => {
  const { loanId } = req.params;
  const { amount, payment_type } = req.body;

  const select_query = `SELECT * FROM Loans WHERE loan_id = '${loanId}'`;
  const details = await db.get(select_query);

  if (!details) {
    return res.status(404).send({ error: "Loan not found" });
  }

  const { monthly_emi, total_amount } = details;
  const payment_id = uuidv4();

  let remaining_amount = total_amount;
  let remaining_emi = null;
  let new_status = status_constants.active;

  if (payment_type === "EMI") {
    remaining_amount = total_amount - monthly_emi;
    remaining_emi = Math.ceil(remaining_amount / monthly_emi);
    if (remaining_amount <= 0) {
      remaining_amount = 0;
      new_status = status_constants.completed;
    }

    const update_query = `
      UPDATE Loans
      SET total_amount = ${remaining_amount},
          status = '${new_status}'
      WHERE loan_id = '${loanId}'
    `;
    await db.run(update_query);
  } else if (payment_type === "LUMP_SUM") {
    remaining_amount = total_amount - amount;

    if (remaining_amount <= 0) {
      remaining_amount = 0;
      new_status = status_constants.completed;
    }

    remaining_emi = Math.ceil(remaining_amount / monthly_emi);

    const update_query = `
      UPDATE Loans
      SET total_amount = ${remaining_amount},
          status = '${new_status}'
      WHERE loan_id = '${loanId}'
    `;
    await db.run(update_query);
  }

  const insert_query = `
    INSERT INTO Payments (payment_id, loan_id, amount, payment_type)
    VALUES ('${payment_id}', '${loanId}', ${amount}, '${payment_type}')
  `;
  await db.run(insert_query);

  const result = {
    payment_id,
    loan_id: loanId,
    message: "Payment recorded successfully",
    remaining_balance: remaining_amount,
    emis_left: remaining_emi,
  };
  res.send(result);
});

//This will give us specific loan details(2.3)
app.get("/api/v1/loans/:loanId/ledger", async (req, res) => {
  const { loanId } = req.params;

  const loanQuery = `SELECT * FROM Loans WHERE loan_id = '${loanId}'`;
  const loan = await db.get(loanQuery);
  if (!loan) {
    return res.status(404).send({ error: "Loan not found" });
  }

  const { loan_id, customer_id, principal_amount, total_amount, monthly_emi } =
    loan;

  const txnQuery = `SELECT * FROM Payments WHERE loan_id = '${loanId}' ORDER BY payment_date ASC`;
  const transactions = await db.all(txnQuery);

  let amount_paid = 0;
  for (const i of transactions) {
    amount_paid += i.amount;
  }
  const total_amount_first = total_amount + amount_paid;
  const emis_left = Math.ceil(total_amount / monthly_emi);

  const new_transactions = transactions.map((each) => ({
    transaction_id: each.payment_id,
    date: each.payment_date,
    amount: each.amount,
    type: each.payment_type,
  }));

  const result = {
    loan_id,
    customer_id,
    principal: principal_amount,
    total_amount: total_amount_first,
    monthly_emi,
    amount_paid,
    balance_amount: total_amount,
    emis_left,
    transactions: new_transactions,
  };

  res.send(result);
});

//This will give us total number of loans of customer(2.4)
app.get("/api/v1/customers/:customerId/overview", async (req, res) => {
  const { customerId } = req.params;
  const customerQuery = `SELECT * FROM Customers where customer_id = '${customerId}'`;
  const details = await db.get(customerQuery);
  if (!details) {
    return res.status(404).send({ error: "Customer does not exist" });
  }

  const loanQuery = `SELECT * FROM Loans where customer_id = '${customerId}'`;
  const loanDetails = await db.all(loanQuery);
  if (loanDetails.length === 0) {
    return res.status(404).send({ error: "Customer does not have any loans" });
  }

  const loansArray = loanDetails.map((each) => {
    const {
      loan_id,
      monthly_emi,
      principal_amount,
      total_amount,
      loan_period_years,
      interest_rate,
    } = each;
    const total_interest =
      principal_amount * loan_period_years * (interest_rate / 100);
    const total_amount_first = principal_amount + total_interest;
    const emis_left = Math.ceil(total_amount / monthly_emi);
    return {
      loan_id,
      principal: principal_amount,
      total_amount: total_amount_first,
      total_interest,
      emi_amount: monthly_emi,
      amount_paid: total_amount_first - total_amount,
      emis_left,
    };
  });

  const result = {
    customer_id: customerId,
    total_loans: loanDetails.length,
    loans: loansArray,
  };
  res.send(result);
});
