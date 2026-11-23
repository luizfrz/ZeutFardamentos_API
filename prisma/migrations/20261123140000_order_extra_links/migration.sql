-- CreateTable
CREATE TABLE "_OrderExtraClients" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_OrderExtraClients_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_OrderExtraResponsibles" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_OrderExtraResponsibles_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_OrderExtraClients_B_index" ON "_OrderExtraClients"("B");

-- CreateIndex
CREATE INDEX "_OrderExtraResponsibles_B_index" ON "_OrderExtraResponsibles"("B");

-- AddForeignKey
ALTER TABLE "_OrderExtraClients" ADD CONSTRAINT "_OrderExtraClients_A_fkey" FOREIGN KEY ("A") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OrderExtraClients" ADD CONSTRAINT "_OrderExtraClients_B_fkey" FOREIGN KEY ("B") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OrderExtraResponsibles" ADD CONSTRAINT "_OrderExtraResponsibles_A_fkey" FOREIGN KEY ("A") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OrderExtraResponsibles" ADD CONSTRAINT "_OrderExtraResponsibles_B_fkey" FOREIGN KEY ("B") REFERENCES "Responsible"("id") ON DELETE CASCADE ON UPDATE CASCADE;

