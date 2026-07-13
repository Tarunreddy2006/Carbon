# 🌍 Carbon

> **Carbon estimation project at ground level for current execution.**

Carbon is a web-based application designed to calculate and estimate carbon footprints. Built with a robust Python backend and a responsive HTML/CSS/JavaScript frontend, this project aims to provide accurate environmental impact assessments at the ground level.

---

## ⚙️ How It Works
The application follows a modular architecture separating the user interface from the business logic:
1. **User Input:** Users interact with the frontend interface to input their ground-level data.
2. **API Routing:** The frontend sends this data to the Python backend via API endpoints defined in the `routes/` directory.
3. **Processing & Estimation:** The routes pass the data to the `services/` layer, which acts as the calculation engine utilizing reference data (like emission factors stored in `codes.json`).
4. **Data Management:** The `models/` directory ensures all data is structured correctly before being processed or saved.
5. **Output:** The backend returns the estimated carbon footprint to the frontend, where it is dynamically displayed to the user.

---

## 🚀 Features
* **Accurate Estimation:** Calculates carbon emissions based on real-world ground-level inputs.
* **Modular Backend:** Clean architecture separating routes, services, models, and utility functions.
* **Interactive Frontend:** A user-friendly web interface for inputting data and viewing results.
* **Production Ready:** Pre-configured with `gunicorn.conf.py` for seamless, scalable deployment.

---

## 🛠️ Tech Stack
* **Backend:** Python
* **Frontend:** HTML5, CSS3, Vanilla JavaScript
* **Server:** Gunicorn

---

## 📂 Project Structure

```text
Carbon/
├── frontend/           # Frontend assets (HTML, CSS, JS)
├── models/             # Data models and database schemas
├── routes/             # API endpoint definitions and routing
├── services/           # Core business logic and calculation engines
├── utils/              # Helper functions and utilities
├── .gitignore          # Ignored files for Git
├── carbon.py           # Main application entry point
├── codes.json          # Configuration, constants, and emission factor codes
├── gunicorn.conf.py    # Gunicorn WSGI server configuration
└── start.sh            # Shell script for application startup/deployment


🌍 Environment Requirements
Before running the project, ensure your environment meets the following requirements:

Python: Version 3.8 or higher installed on your system.

Package Manager: pip (comes standard with Python).

Operating System: Linux, macOS, or Windows (via WSL/Git Bash recommended for the .sh script).

Environment Variables (Optional but Recommended):
If your app connects to a database or uses external APIs, create a .env file in the root directory to store sensitive information.

💻 How to Run Locally
Follow these steps to get the project running on your local machine.

1. Clone the repository
Bash
git clone [https://github.com/Tarunreddy2006/Carbon.git](https://github.com/Tarunreddy2006/Carbon.git)
cd Carbon
2. Set up a Virtual Environment
It is highly recommended to isolate your project dependencies.

Bash
# Create the virtual environment
python -m venv venv

# Activate the virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate
3. Install Dependencies
Install all required Python libraries.

Bash
pip install -r requirements.txt
4. Run the Application
You have a few options for starting the server depending on your setup:

Option A: Using the provided bash script (Recommended for Linux/macOS)
Make sure the script has execution permissions, then run it:

Bash
chmod +x start.sh
./start.sh
Option B: Running with Gunicorn (Production Simulation)
You can use the provided Gunicorn configuration file directly:

Bash
gunicorn -c gunicorn.conf.py carbon:app 
Option C: Running Python directly (Standard Development)

Bash
python carbon.py





