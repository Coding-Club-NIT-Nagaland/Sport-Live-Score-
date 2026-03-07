🏆 NIT Nagaland Sports Arena
The NIT Nagaland Sports Arena is a high-performance, real-time sports broadcasting and management platform built specifically for the annual sports meet at NIT Nagaland. It replaces traditional manual scoring with a dynamic, "Stadium-View" digital experience, providing students and faculty with instantaneous updates on match results and championship standings.

✨ Core Features
Real-Time Live Scoring: Utilizes Socket.io to push score updates, match timers, and set results to all users instantly without page refreshes.

Role-Based Access Control (RBAC): Secure management system where specific Sport Secretaries (e.g., Football, Cricket, Indoor Games) can only manage their authorized events.

Automated Standings: Group stage matches automatically calculate "Played, Won, Lost, and Points" for the sports standings table.

Championship Leaderboard: A visual, color-coded bar chart that tracks the overall points of all five houses in the race for the championship trophy.

Mobile-First Design: A fully responsive UI that allows students to track live action directly from the sports field on their mobile devices.

Admin Tools: Specialized controls for match forfeits, result corrections, "Service" indicators for court games, and extra-time (ET) management.

🛠️ Tech Stack
Frontend: React.js, Tailwind CSS, Lucide React, Recharts.

Backend: Node.js, Express.js.

Database: MongoDB & Mongoose.

Real-time Logic: Socket.io.

Security: JWT (JSON Web Tokens), BcryptJS, Helmet (CSP), and Rate Limiting.

📂 Project Architecture
/frontend: The React application containing the student dashboard and admin control panels.

/backend: The Express API handling authentication, database transactions, and real-time broadcasts.

secretaries.json: The master configuration used to initialize official council accounts with specific sport permissions.

🤝 Contributing
This project is an open initiative by the Coding Club NIT Nagaland. We encourage students to contribute to the platform's growth.

How to Contribute:

Fork the repository.

Create a Feature Branch (git checkout -b feature/AmazingFeature).

Commit your changes (git commit -m 'Add some AmazingFeature').

Push to the branch and open a Pull Request.

Roadmap for Contributors:

Integrating a "Player of the Match" voting system.

Adding a live photo gallery for match highlights.

Developing push notifications for major finals.

Creating an "Announcements" ticker for TechAvinya updates.

🛡️ License & Security
This project is licensed under the MIT License. To maintain the security of the Sports Council's access, sensitive information like JWT_SECRET and MONGO_URI are managed strictly via environment variables and are never committed to the repository.

📬 Contact
Project Lead: Meraj Alam
Organization: Coding Club, National Institute of Technology Nagaland
Email: merajalamnazeeri@gmail.com