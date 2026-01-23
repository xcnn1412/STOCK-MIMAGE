# 📸 STOCK-MIMAGE

> **The Ultimate Event & Inventory Management for Image Automat**
>
> ระบบจัดการคลังสินค้าและอุปกรณ์ออกงานอีเวนต์ที่ทันสมัย ใช้งานง่าย และแม่นยำ

![Next.js](https://img.shields.io/badge/Next.js-14-black) ![Supabase](https://img.shields.io/badge/Supabase-Database-green) ![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue) ![TailwindCSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC)

---

## 🚀 Overview

**STOCK-MIMAGE** is a purpose-built application designed to streamline the chaotic workflow of event logistics. It bridges the gap between warehouse inventory and on-site event management, ensuring every piece of equipment—from cameras to cables—is tracked, assigned, and returned correctly.

## ✨ Key Features

### 📦 Smart Inventory & Kits

- **Kit Management**: Group loose items into "Kits" (e.g., "Photo Booth Set A") for bulk assignment.
- **Item Tracking**: Detailed item profiles with serial numbers, status (Available, In Use, Maintenance, Lost), and image records.
- **QR Code Integration**: Generate and print QR codes for each Kit for instant mobile check-in/out scanning.

### 📅 Event Logistics Flow

- **Event Dashboard**: Create events, assign staff, and schedule dates.
- **Kit Assignment**: Assign multiple kits to an event with a single click.
- **Closure Workflow**: A structured "Return Checklist" process that forces staff to verify every item upon return.
- **Historical Snapshots**: When an event closes, the system takes a "Snapshot" of the inventory state, creating an immutable record of what was returned and its condition.

### 👥 Staff & Security

- **Role-Based Access**: Admins verify and approve staff registrations.
- **Activity Logging**: Tracks _who_ did _what_ and _where_ (includes GPS location tagging for sensitive actions).
- **Selfie Verification**: Optional selfie requirement for adding an extra layer of security during login.

### 🎨 Modern UI/UX

- **Responsive Design**: Mobile-first approach for staff working on-site.
- **Dark Mode Support**: Comfortable usage in low-light event environments.
- **Performance**: Built on Next.js 14 and Supabase for real-time speed.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/) (Strict typing for reliability)
- **Database & Auth**: [Supabase](https://supabase.com/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) & [Shadcn/UI](https://ui.shadcn.com/)
- **Icons**: Lucide React

---

## 🏁 Getting Started

1. **Clone the repository**

   ```bash
   git clone https://github.com/xcnn1412/STOCK-MIMAGE.git
   cd STOCK-MIMAGE
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `.env.local` file with your Supabase credentials:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   ```

4. **Run the development server**

   ```bash
   npm run dev
   ```

5. **Open the app**
   Visit [http://localhost:3000](http://localhost:3000)

---

## 🔒 License

Private Property of Image Automat. All rights reserved.
