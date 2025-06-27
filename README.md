# Discord Bot For Sales
A powerful Discord bot designed to automate and manage sales through Discord servers. Perfect for digital product sellers, service providers, and community managers.

Veja o vídeo explicativo sobre o projeto:

![Bot Status](https://img.shields.io/badge/status-active-success)
![License](https://img.shields.io/badge/license-MIT-blue)

![ef0716d3-ac42-466d-af41-631e9f796b93](https://private-user-images.githubusercontent.com/178500256/430678987-ae303f02-97bd-4d98-851c-36d2dd423022.png?jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NTA5OTg0ODAsIm5iZiI6MTc1MDk5ODE4MCwicGF0aCI6Ii8xNzg1MDAyNTYvNDMwNjc4OTg3LWFlMzAzZjAyLTk3YmQtNGQ5OC04NTFjLTM2ZDJkZDQyMzAyMi5wbmc_WC1BbXotQWxnb3JpdGhtPUFXUzQtSE1BQy1TSEEyNTYmWC1BbXotQ3JlZGVudGlhbD1BS0lBVkNPRFlMU0E1M1BRSzRaQSUyRjIwMjUwNjI3JTJGdXMtZWFzdC0xJTJGczMlMkZhd3M0X3JlcXVlc3QmWC1BbXotRGF0ZT0yMDI1MDYyN1QwNDIzMDBaJlgtQW16LUV4cGlyZXM9MzAwJlgtQW16LVNpZ25hdHVyZT03MDk4OTNkYTNhOTY2YTBmYWJlZmRiMWFlNDY2NWE0YzczOGRmOTNhNWQwYzZlZDZkOGZkMzgwYmU1NzZkNzI5JlgtQW16LVNpZ25lZEhlYWRlcnM9aG9zdCJ9.EsZsDySwCVHu1dY0xNzAe_tB0Mu4o7UMKPOiclcLL8M)
## 🌟 Features

- **Automated Ticket System**
  - Custom ticket creation
  - Private threads for each customer
  - Configurable ticket categories

- **Payment Integration**
  - PIX payment support (Brazilian payment method)
  - Payment proof verification
  - Automated payment validation

- **Shopping Cart System**
  - Main product selection
  - Additional/complementary products
  - Quantity control (+1/-1 buttons)
  - Remove items functionality
  - Total amount calculation
  - Organized interface with separate embeds

- **Voice Channel Management**
  - Automatic voice channel connection
  - Voice status monitoring
  - Channel configuration options

- **Sales Management**
  - Sales channel configuration
  - Delivery confirmation system
  - Transaction history

## 📋 Requirements

- Node.js 16.9.0 or higher
- MongoDB database
- Discord Bot Token
- Discord.js v14

## 🚀 Installation

1. Clone the repository:
```bash
git clone https://github.com/ronieremarques/DiscordBotForSales.git
```

2. Install dependencies:
```bash
cd DiscordBotForSales
npm install
```

3. Create a `.env` file with your credentials:
```env
DISCORD_TOKEN=your_bot_token_here
MONGO_URI=your_mongodb_uri_here
```

4. Start the bot:
```bash
npm start
```

## 💻 Commands

- `/ticket` - Creates a ticket embed with configuration options
- `/connect` - Connects the bot to a voice channel
- More commands coming soon!

## ⚙️ Configuration

The bot uses a configuration system that can be managed through Discord commands:

- Ticket system customization
- Sales channel setup
- PIX key configuration
- Voice channel settings

## 🔒 Security

- Admin-only configuration commands
- Secure payment verification system
- Private ticket threads
- Permission-based access control

## 🤝 Support

Need help? Join our Discord support server:
[Click here to join](https://discord.gg/fTWS6D4qCk)

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## ⚠️ Disclaimer

This bot is provided "as is" without warranty of any kind. Use at your own risk.

## 📞 Contact

- Discord Support Server: [Join Here](https://discord.gg/fTWS6D4qCk)
- Report Issues: [GitHub Issues](https://github.com/ronieremarques/DiscordBotForSales/issues)

---
Made with ❤️ for the Discord community
