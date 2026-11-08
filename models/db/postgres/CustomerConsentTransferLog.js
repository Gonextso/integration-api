import prisma from '../../../builders/database/prismaBuilder.js';

class CustomerConsentTransferLogModel {
  async createPending(data) {
    return prisma.customerConsentTransferLog.create({
      data: {
        ...data,
        status: 'PENDING',
      },
    });
  }

  async complete(id, data) {
    return prisma.customerConsentTransferLog.update({
      where: { id },
      data: {
        ...data,
        completedAt: new Date(),
      },
    });
  }
}

export default new CustomerConsentTransferLogModel();
