import { audit } from "@/infrastructure/audit";
import { prisma, transactionRunner } from "@/infrastructure/database/client";
import { outbox } from "@/infrastructure/outbox";
import { authorize, can } from "@/modules/auth";
import {
  createCancelPledge,
  createChangeCampaignStatus,
  createConfirmDonation,
  createCreateCampaign,
  createEditCampaign,
  createGetCampaign,
  createListCampaignsForAdmin,
  createListDonationsForAdmin,
  createListMyDonations,
  createListOpenCampaigns,
  createMarkNotReceived,
  createPledgeDonation,
  createSetPledgeReference,
} from "@/modules/donations";
import {
  createPrismaDonationQueries,
  createPrismaDonationStore,
} from "@/modules/donations/server";

const deps = {
  store: createPrismaDonationStore({
    runner: transactionRunner,
    audit,
    outbox,
  }),
  queries: createPrismaDonationQueries(prisma),
  authorize,
};

export const listOpenCampaigns = createListOpenCampaigns(deps);
export const getCampaign = createGetCampaign(deps);
export const pledgeDonation = createPledgeDonation(deps);
export const setPledgeReference = createSetPledgeReference(deps);
export const cancelPledge = createCancelPledge(deps);
export const listMyDonations = createListMyDonations(deps);

export const listCampaignsForAdmin = createListCampaignsForAdmin(deps);
export const createCampaign = createCreateCampaign(deps);
export const editCampaign = createEditCampaign(deps);
export const changeCampaignStatus = createChangeCampaignStatus(deps);

export const listDonationsForAdmin = createListDonationsForAdmin({
  ...deps,
  can,
});
export const confirmDonation = createConfirmDonation({ ...deps, can });
export const markNotReceived = createMarkNotReceived({ ...deps, can });
