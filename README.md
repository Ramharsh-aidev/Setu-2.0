# 🎤 **SETU** - Voice-Native AI for Government Schemes

> Your Personal Guide to Government Schemes Through Conversational AI

A comprehensive system that combines voice interaction, vector search, and machine learning to help Indians discover government schemes through natural conversation.

---

## 🚀 **Quick Start**

### Prerequisites
- Node.js 18+ & npm
- Docker & Docker Compose
- Hugging Face API Token
- Vapi API Credentials

### 1. Clone & Setup
```bash
# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env.local

# Edit .env.local with your credentials
```

### 2. Start Services (Docker)
```bash
# Start Qdrant and PostgreSQL
docker-compose up -d

# Verify services are running
docker-compose ps
```

### 3. Run Development Stack
```bash
# Terminal 1: Start Backend (port 3001)
npm run backend

# Terminal 2: Start Frontend (port 3000)
npm run dev

# Terminal 3: Run Scraper manually (optional)
npm run scraper
```

### 4. Access the App
- **Frontend**: http://localhost:3000 🎤
- **Backend**: http://localhost:3001 🔌
- **Qdrant**: http://localhost:6333 📊
- **pgAdmin**: http://localhost:5050 🗄️

---

## 🏗️ **System Architecture**

```
┌──────────────────────────────────────────┐
│   Next.js Frontend (React + Tailwind)   │
│   - Vapi Voice Integration              │
│   - Real-time Conversation UI           │
│   - Scheme Recommendations              │
└────────┬─────────────────────────────────┘
         │ REST API
┌────────▼─────────────────────────────────┐
│   Express Backend Node.js Server        │
│   - Vapi Webhook Handler               │
│   - Orchestration Logic                │
│   - Session Management                 │
└────┬──────────────────────┬──────────────┘
     │                      │
┌────▼─────────────┐   ┌───▼────────────────┐
│  Qdrant (6333)  │   │ PostgreSQL (5432)  │
│ Vector Database │   │ Session Storage    │
│ - Schemes       │   │ - Conversations    │
│ - Context       │   │ - Metadata         │
└─────────────────┘   └────────────────────┘
     │
┌────▼────────────────────────────────────┐
│ Hugging Face Inference API             │
│ - LLM Reasoning                        │
│ - Embeddings                           │
│ - Entity Extraction                    │
└────────────────────────────────────────┘
```

---

## 📁 **Project Structure**

```
setu/
├── app/
│   ├── components/          # React Components
│   │   ├── VapiClient.tsx
│   │   ├── ConversationDisplay.tsx
│   │   ├── SchemeRecommendations.tsx
│   │   ├── StatusIndicator.tsx
│   │   └── EntityExtractor.tsx
│   ├── page.tsx             # Main Page
│   ├── layout.tsx
│   └── globals.css          # Tailwind v4
├── lib/
│   ├── qdrant.js            # Vector DB service
│   ├── huggingface.js       # LLM service
│   ├── database.js          # PostgreSQL service
│   └── scraper.js           # Periodic scraper
├── routes/                  # Backend Routes
│   ├── vapi-webhook.js
│   ├── schemes.js
│   └── sessions.js
├── data/                    # Scraped Data
│   ├── schemes_list.json
│   ├── schemes_details.json
│   └── scraper/
├── scripts/
│   └── scraper.js
├── server.js                # Express Entry
├── docker-compose.yml       # Docker Setup
├── package.json
└── .env.local              # Configuration
```

---

## 🔌 **API Endpoints**

### Vapi Routes (`/api/vapi`)
```
POST   /webhook              Process voice messages
POST   /session/start         Create new session
POST   /session/end          Close session
GET    /session/:sessionId   Get session details
```

### Schemes Routes (`/api/schemes`)
```
POST   /search              Search by query
POST   /filter              Filter by criteria (income, occupation, state)
GET    /:slug              Get scheme details
GET    /stats/collection   Collection stats
```

### Sessions Routes (`/api/sessions`)
```
GET    /:sessionId                 Get session
GET    /:sessionId/history        Get conversation
GET    /:sessionId/recommendations Get eligibility
GET    /:sessionId/entities       Get extracted info
```

---

## ⚙️ **Configuration**

### Environment Variables (`.env.local`)

```env
# ============ VAPI ============
NEXT_PUBLIC_VAPI_PUBLIC_KEY=your_public_key
VAPI_PRIVATE_KEY=your_private_key

# ============ QDRANT ============
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your_api_key

# ============ HUGGING FACE ============
HF_API_TOKEN=hf_your_token_here
HF_MODEL_ID=meta-llama/Llama-2-7b-chat-hf
# Alternatives:
# mistralai/Mistral-7B-Instruct-v0.1
# google/flan-t5-base

# ============ DATABASE ============
DATABASE_URL=postgresql://setu_user:setu_password@localhost:5432/setu_db

# ============ SCRAPER ============
SCRAPER_SCHEDULE=0 2 * * *      # Daily 2 AM (cron format)
SCRAPER_ENABLED=true
SCRAPER_PAGE_SIZE=50
```

---

## 🔄 **Periodic Scraping**

The system automatically scrapes and updates scheme data daily at 2 AM UTC (configurable).

**Key Features:**
- ✅ Hash-based deduplication (skips unchanged schemes)
- ✅ Batch processing to Qdrant
- ✅ Error recovery
- ✅ Rate limiting

**Manual Trigger:**
```bash
npm run scraper
```

---

## 📊 **Data Flow Example**

```
User Says: "I'm a farmer from Maharashtra with income 2 lakh"
    ↓
[Entity Extraction] → {occupation: "farmer", state: "Maharashtra", income: 200000}
    ↓
[Generate Embedding] → Vector representation
    ↓
[Qdrant Search] → Find top 10 similar schemes
    ↓
[Eligibility Check] → PM-Kisan (eligible), Tractor Subsidy (eligible)
    ↓
[LLM Response] → "You qualify for PM-Kisan because your income is < 2.5L"
    ↓
[Store Session] → PostgreSQL conversation record
    ↓
[Display UI] → Show recommendations + extracted info
```

---

## 🚀 **Deployment**

### Build
```bash
npm run build
npm run start
```

### Docker (Services Only)
```bash
docker-compose build
docker-compose push
```

### Production Environment
```env
NODE_ENV=production
QDRANT_URL=https://your-qdrant-cloud.com
DATABASE_URL=postgresql://prod_user:safe_password@prod_host/setu_db
HF_API_TOKEN=your_prod_token
```

---

## 🤖 **AI Models**

### Embeddings
- **Model**: `sentence-transformers/all-MiniLM-L6-v2`
- **Size**: 384 dimensions
- **Speed**: ~50ms per text

### LLM (Configurable)
- **Default**: Meta Llama 2 7B Chat
- **Inference Time**: 2-5 seconds
- **Tokens**: 512 context window

---

## 📱 **Supported Languages**

Currently: English, Hindi, Marathi, Tamil

To add more:
1. Update `getFirstMessage()` in `app/components/VapiClient.tsx`
2. Add translations in LLM system prompts

---

## ❓ **Troubleshooting**

| Issue | Solution |
|-------|----------|
| Qdrant connection failed | Check `docker-compose ps` and firewall |
| HF rate limit exceeded | Increase `SCRAPER_SCHEDULE` interval |
| Database error | Verify PostgreSQL is running (`docker-compose logs postgres`) |
| Vapi microphone not working | Check browser microphone permissions |
| Empty recommendations | Ensure schemes are scraped first |

---

## 📚 **Database Schema**

Three main tables:
- **sessions**: User session records
- **conversation_history**: All user/AI messages
- **schemes_metadata**: Scheme deduplication hashes

---

## 🎯 **Roadmap**

- [ ] Multi-modal search (text + voice + image)
- [ ] WhatsApp/SMS Integration
- [ ] Document verification flow
- [ ] Offline LLM support
- [ ] Mobile app (React Native)
- [ ] Admin dashboard
- [ ] A/B testing framework

---

## 📜 **License**

MIT License - See LICENSE file

---

## 🤝 **Contributing**

See CONTRIBUTING.md for guidelines.

---

**Made with ❤️ to bridge the gap between Indians and government schemes**
