import { prisma } from "../../config/database";

export class ErpRepository {
  async getProducts() {
    return prisma.erpProduct.findMany();
  }

  async getLeads() {
    return prisma.erpLead.findMany({ orderBy: { createdAt: "desc" } });
  }

  async createLead(data: {
    name: string;
    phone: string;
    email?: string;
    status?: string;
    source?: string;
    requirements?: string;
  }) {
    return prisma.erpLead.create({
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        status: data.status || "new",
        source: data.source || "whatsapp",
        requirements: data.requirements || null,
      },
    });
  }

  async getInventorySummary() {
    const products = await prisma.erpProduct.findMany();
    const orders = await prisma.erpOrder.findMany();
    const leads = await prisma.erpLead.findMany();

    return {
      totalProducts: products.length,
      totalOrders: orders.length,
      totalLeads: leads.length,
      products,
    };
  }
}

export const erpRepository = new ErpRepository();
