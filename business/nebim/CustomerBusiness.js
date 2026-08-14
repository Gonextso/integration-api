import CoreClass from "../../core/CoreClass.js";
import NebimV3IntegratorAPI from "../../apis/NebimV3IntegratorAPI.js";
import NebimCache from "../../cache/NebimCache.js";
import CacheFields from "../../enums/CacheFields.js";

const SETUP_TEST_EMAIL = "support@gonextso.com";
const SETUP_TEST_PHONE = "05555555555";
const SETUP_TEST_FIRST_NAME = "Gonextso";
const SETUP_TEST_LAST_NAME = "Test Müşteri";
const SETUP_TEST_ADDRESS_TEXT = "Bu bir test adresidir";

export default class NebimCustomerClass extends CoreClass {
    constructor(tenant) {
        super(tenant);
        this.api = new NebimV3IntegratorAPI(tenant);
        this.cache = new NebimCache(tenant);
    }

    fetchCustomer = async ({ email, phone }) => {
        const shortInfo = await this.api.runProcReturnSingle(this.tenant.nebim.procNames.customer.check, {
            "Email": email ?? "",
            "Phone": phone ?? "",
            "PhoneType": this.tenant.nebim.customer.phoneType
        });

        if (!shortInfo.CustomerCode) return null;

        return this.api.getModel("customer", shortInfo.CustomerCode);
    }


    syncCustomerFromOrder = async (order) => {
        const nebimCustomer = await this.fetchCustomer(order.customer);

        if (nebimCustomer) return this.#updateCustomer(nebimCustomer, order);
        return this.#createCustomer(order);
    }

    createSetupTestCustomer = async () => {
        await this.#ensureAddressCodesCached();

        const firstAddressRow = await this.cache.getFirstAddressRow();
        const nowIso = new Date().toISOString();

        const result = await this.#createCustomer({
            customer: {
                email: SETUP_TEST_EMAIL,
                phone: SETUP_TEST_PHONE,
                first_name: SETUP_TEST_FIRST_NAME,
                last_name: SETUP_TEST_LAST_NAME,
                consents: {
                    email: { date: nowIso, is_opt_in: true },
                    gsm: { date: nowIso, is_opt_in: true },
                },
            },
            address: {
                city: firstAddressRow.CityDescription,
                district: firstAddressRow.DistrictDescription,
                address_text: SETUP_TEST_ADDRESS_TEXT,
            },
            is_receiver_not_customer: false,
        });

        return {
            CustomerCode: result.CustomerCode,
        };
    }

    #ensureAddressCodesCached = async () => {
        const allAddressCodes = await this.cache.get(CacheFields.NEBIM.ADDRESS_CODES);

        if (allAddressCodes?.length) return;

        const rows = await this.api.runProc(this.tenant.nebim.procNames.defaults.addressCodes);
        if (rows instanceof Error) {
            this.throws(`Address codes procedure failed: ${rows.message}`);
        }
        if (!Array.isArray(rows) || rows.length === 0) {
            this.throws("Address codes cache is empty");
        }

        await this.cache.set(CacheFields.NEBIM.ADDRESS_CODES, rows);
    }

    #getAddressCodes = async (address) => {
        const addressCodes = await this.cache.findAddressCode(address);

        if (!addressCodes) this.throws(`Address cannot found from cache. Address: ${JSON.stringify(address)}`);

        return addressCodes;
    }

    #getExistsOrderAddress = (customerAddresses, { address_text }) => {
        return customerAddresses.filter(x => x.Address === address_text)[0];
    }

    #createCustomer = async ({ customer, address, is_receiver_not_customer }) => {
        const addressCodes = await this.#getAddressCodes(address);
        const customerNebimAddress = {
            AddressTypeCode: this.tenant.nebim.customer.addressType,
            CountryCode: addressCodes.CountryCode,
            StateCode: addressCodes.StateCode,
            CityCode: addressCodes.CityCode,
            DistrictCode: addressCodes.DistrictCode,
            Address: address.address_text
        };
        const nowIso = new Date().toISOString();
        const emailConsentRaw = customer?.consents?.email?.date ?? nowIso;
        const gsmConsentRaw = customer?.consents?.gsm?.date ?? nowIso;
        const emailOptIn = customer?.consents?.email?.is_opt_in ?? false;
        const gsmOptIn = customer?.consents?.gsm?.is_opt_in ?? false;
        const [ emailConsentDate, emailConsentTimeZ ] = emailConsentRaw.split("T");
        const [ gsmConsentDate, gsmConsentTimeZ ] = gsmConsentRaw.split("T");

        const base = {
            ModelType: 3,
            FirstName: customer.first_name,
            LastName: customer.last_name,
            OfficeCode: this.tenant.nebim.order.office,
            DataLanguageCode: "TR",
            IdentityNum: "11111111111",
            AccountOpeningDate: new Date().toISOString(),
            PostalAddresses: [!is_receiver_not_customer ? customerNebimAddress : { AddressTypeCode: this.tenant.nebim.customer.addressType }],
            CurrAccPersonalDataConfirmations: (this.tenant.nebim.customer.confirmationFormTypeCode && this.tenant.nebim.customer.confirmationFormStatusCode && this.tenant.nebim.customer.inactivationReasonCode) ? [{
                ConfirmationDate: new Date().toISOString(),
                ConfirmationFormTypeCode: this.tenant.nebim.customer.confirmationFormTypeCode,
                FormNumber: "digital",
                InActivationReasonCode: this.tenant.nebim.customer.inactivationReasonCode,
                ConfirmationFormStatusCode: this.tenant.nebim.customer.confirmationFormStatusCode,
                CanShareWithThirdParty: true,
                CanShareWithForeignCountries: true,
                CallPermission: true,
                SmsPermission: true,
                EmailPermission: true,
                AddressPermission: true
            }] : [],
            Communications: [
                {
                    CommunicationTypeCode: "3",
                    CommAddress: customer.email,
                    OptInOptOutStatusIntegrator: (this.tenant.nebim.customer.confirmationFormTypeCode && this.tenant.nebim.customer.confirmationFormStatusCode) ? {
                        Call: false,
                        CompanyBrandCode: "",
                        ConfirmationFormStatusCode: this.tenant.nebim.customer.confirmationFormStatusCode, 
                        ConfirmationFormTypeCode: this.tenant.nebim.customer.confirmationFormTypeCode, 
                        ConsentDate: emailConsentDate,
                        ConsentTime: emailConsentTimeZ.replace("Z", "").split(".")[0].split("-")[0],
                        ConsentSource: this.tenant.nebim.customer.consentSource,
                        Email: true,
                        FormNumber: "digital",
                        OptIn: emailOptIn,
                        RecipientType: 1,
                        SMS: false
                    } : {}
                },
                {
                    CommunicationTypeCode: this.tenant.nebim.customer.phoneType,
                    CommAddress: customer.phone,
                    OptInOptOutStatusIntegrator: (this.tenant.nebim.customer.confirmationFormTypeCode && this.tenant.nebim.customer.confirmationFormStatusCode) ? {
                        Call: true,
                        CompanyBrandCode: "",
                        ConfirmationFormStatusCode: this.tenant.nebim.customer.confirmationFormStatusCode, 
                        ConfirmationFormTypeCode: this.tenant.nebim.customer.confirmationFormTypeCode, 
                        ConsentDate: gsmConsentDate,
                        ConsentTime: gsmConsentTimeZ.replace("Z", "").split(".")[0].split("-")[0],
                        ConsentSource: this.tenant.nebim.customer.consentSource,
                        Email: false,
                        FormNumber: "digital",
                        OptIn: gsmOptIn,
                        RecipientType: 1,
                        SMS: true
                    } : {}
                }
            ],
            Contacts: [is_receiver_not_customer ? {
                ContactTypeCode: "C",
                FirstName: address.first_name,
                LastName: address.last_name,
                IsBlocked: false,
                IsAuthorized: true
            }: null].filter(x => x)
        }

        let nebimCustomer = await this.api.post(base);

        if (is_receiver_not_customer) {
            nebimCustomer = await this.#addContactAddress(nebimCustomer, nebimCustomer.Contacts[0].ContactID,  customerNebimAddress, address.phone);
        }

        return {
            CustomerCode: nebimCustomer.CurrAccCode,
            ShippingPostalAddressID: is_receiver_not_customer ? nebimCustomer.PostalAddressesWithContacts.filter(x => x.AddressTypeCode == this.tenant.nebim.customer.addressType)[0].PostalAddressID : nebimCustomer.PostalAddresses[0].PostalAddressID
        };
    }

    updateConsent = async (customer, communicationType) => {
        const nebimCustomer = await this.fetchCustomer(customer);

        if (!nebimCustomer) return null;

        const emailConsentRaw = customer?.consents?.email?.date;
        const gsmConsentRaw = customer?.consents?.gsm?.date;
        const consentRaw = communicationType === "gsm" ? gsmConsentRaw : emailConsentRaw;
        if (!consentRaw) return { skipped: true, reason: "missing_consent_date" };

        const emailOptIn = customer?.consents?.email?.is_opt_in ?? false;
        const gsmOptIn = customer?.consents?.gsm?.is_opt_in ?? false;
        const [ emailConsentDate, emailConsentTimeZ ] = (emailConsentRaw ?? "").split("T");
        const [ gsmConsentDate, gsmConsentTimeZ ] = (gsmConsentRaw ?? "").split("T");

        const result = await this.api.post({
            ModelType: 3,
            CurrAccCode: nebimCustomer.CurrAccCode,
            Communications: communicationType === "gsm" ? [{
                CommunicationTypeCode: this.tenant.nebim.customer.phoneType,
                CommunicationID: nebimCustomer.Communications.filter(x => x.CommunicationTypeCode === this.tenant.nebim.customer.phoneType && x.CommAddress == customer.phone)[0].CommunicationID,
                OptInOptOutStatusIntegrator: (this.tenant.nebim.customer.confirmationFormTypeCode && this.tenant.nebim.customer.confirmationFormStatusCode) ? {
                    Call: true,
                    CompanyBrandCode: "",
                    ConfirmationFormStatusCode: this.tenant.nebim.customer.confirmationFormStatusCode,
                    ConfirmationFormTypeCode: this.tenant.nebim.customer.confirmationFormTypeCode,
                    ConsentDate: gsmConsentDate,
                    ConsentTime: gsmConsentTimeZ.replace("Z", "").split(".")[0].split("-")[0],
                    ConsentSource: this.tenant.nebim.customer.consentSource,
                    Email: false,
                    FormNumber: "digital",
                    OptIn: gsmOptIn,
                    RecipientType: 1,
                    SMS: true
                } : {}
            }] : [{
                CommunicationTypeCode: "3",
                CommunicationID: nebimCustomer.Communications.filter(x => x.CommunicationTypeCode === "3" && x.CommAddress == customer.email)[0].CommunicationID,
                OptInOptOutStatusIntegrator: (this.tenant.nebim.customer.confirmationFormTypeCode && this.tenant.nebim.customer.confirmationFormStatusCode) ? {
                    Call: false,
                    CompanyBrandCode: "",
                    ConfirmationFormStatusCode: this.tenant.nebim.customer.confirmationFormStatusCode,
                    ConfirmationFormTypeCode: this.tenant.nebim.customer.confirmationFormTypeCode,
                    ConsentDate: emailConsentDate,
                    ConsentTime: emailConsentTimeZ.replace("Z", "").split(".")[0].split("-")[0],
                    ConsentSource: this.tenant.nebim.customer.consentSource,
                    Email: true,
                    FormNumber: "digital",
                    OptIn: emailOptIn,
                    RecipientType: 1,
                    SMS: false
                } : {}
            }]
        });

        return {
            CustomerCode: result.CurrAccCode
        };
    }

    #updateCustomer = async (nebimCustomer, { address, is_receiver_not_customer }) => {
        const addressCodes = await this.#getAddressCodes(address);
        const existingAddress = this.#getExistsOrderAddress(nebimCustomer.PostalAddresses, address);
        const customerNebimAddress = {
            AddressTypeCode: this.tenant.nebim.customer.addressType,
            CountryCode: addressCodes.CountryCode,
            StateCode: addressCodes.StateCode,
            CityCode: addressCodes.CityCode,
            DistrictCode: addressCodes.DistrictCode,
            Address: address.address_text
        };

        if (existingAddress) {
            return {
                CustomerCode: nebimCustomer.CurrAccCode,
                ShippingPostalAddressID: existingAddress.PostalAddressID
            }
        }

        if (is_receiver_not_customer) {
            const isContactExists = nebimCustomer.Contacts?.some(x => x.FirstName === address.FirstName && x.LastName === address.LastName);

            if (isContactExists) {
                nebimCustomer = await this.#addContactAddress(nebimCustomer, nebimCustomer.Contacts.filter(x => x.FirstName === address.FirstName && x.LastName === address.LastName)[0].ContactID, customerNebimAddress, address.phone);
            } else {
                nebimCustomer = await this.#addContact(nebimCustomer, address.FirstName, address.LastName);
                nebimCustomer = await this.#addContactAddress(nebimCustomer, nebimCustomer.Contacts[0].ContactID, customerNebimAddress, address.phone);
            }
        } else {
            nebimCustomer = await this.#addCustomerAddress(nebimCustomer, customerNebimAddress)
        }

        return {
            CustomerCode: nebimCustomer.CurrAccCode,
            ShippingPostalAddressID: is_receiver_not_customer ? nebimCustomer.PostalAddressesWithContacts.filter(x => x.Address === address.address_text)[0].PostalAddressID : nebimCustomer.PostalAddresses.filter(x => x.Address === address.address_text)[0].PostalAddressID
        };
    }

    #addCustomerAddress = async (nebimCustomer, nebimAddress) => {
        return this.api.post({
            ModelType: 3,
            CurrAccCode: nebimCustomer.CurrAccCode,
            PostalAddresses: [nebimAddress]
        })
    }

    #addContactAddress = async (nebimCustomer, contactId, customerNebimAddress, phone) => {
        return this.api.post({
            ModelType: 3,
            CurrAccCode: nebimCustomer.CurrAccCode,
            Communications: [
                !nebimCustomer.Communications.some(x => x.contactId === contactId && x.phone === phone) ? {
                    ContactID: contactId,
                    CommunicationTypeCode: this.tenant.nebim.customer.phoneType,
                    CommAddress: phone
                } : null
            ].filter(x => x),
            PostalAddresses: [{
                ...customerNebimAddress,
                ContactID: contactId
            }]
        })
    }

    #addContact = async (nebimCustomer, firstName, lastName, identityNum = "11111111111", isBlocked = false) => {
        return this.api.post({
            ModelType: 3,
            CurrAccCode: nebimCustomer.CurrAccCode,
            Contacts: [        {
                ContactTypeCode: "C",
                FirstName: firstName,
                IdentityNum: identityNum,
                IsAuthorized: true,
                IsBlocked: isBlocked,
                JobTitleCode: "",
                LastName: lastName,
                TitleCode: ""
            }]
        })
    }
}
