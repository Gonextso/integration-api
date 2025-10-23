import CoreClass from "../../core/CoreClass.js";
import NebimV3IntegratorAPI from "../../apis/NebimV3IntegratorAPI.js";
import NebimCache from "../../cache/NebimCache.js";

export default class NebimCustomerClass extends CoreClass {
    constructor(tenant) {
        super(tenant);
        this.api = new NebimV3IntegratorAPI(tenant);
        this.cache = new NebimCache(tenant);
    }

    fetchCustomer = async ({ email, phone }) => {
        const shortInfo = await this.api.runProcReturnSingle(this.tenant.nebim.procNames.customer.check, {
            "Email": email ?? "",
            "Phone": phone ?? ""
        });

        if (!shortInfo.CustomerCode) return null;

        return this.api.getModel("customer", shortInfo.CustomerCode);
    }


    syncCustomerFromOrder = async (order) => {
        const nebimCustomer = await this.fetchCustomer(order.customer);

        if (nebimCustomer) return this.#updateCustomer(nebimCustomer, order);
        return this.#createCustomer(order);
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
        const [ emailConsentDate, emailConsentTimeZ ] = customer.consents.email.date ? customer.consents.email.date.split("T") : new Date().toISOString().split("T")
        const [ gsmConsentDate, gsmConsentTimeZ ] = customer.consents.gsm.date ? customer.consents.gsm.date.split("T") : new Date().toISOString().split("T")

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
                        ConsentTime: emailConsentTimeZ.replace("Z", "").split(".")[0],
                        ConsentSource: this.tenant.nebim.customer.consentSource,
                        Email: true,
                        FormNumber: "digital",
                        OptIn: customer.consents.email.is_opt_in,
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
                        ConsentTime: gsmConsentTimeZ.replace("Z", "").split(".")[0],
                        ConsentSource: this.tenant.nebim.customer.consentSource,
                        Email: false,
                        FormNumber: "digital",
                        OptIn: customer.consents.gsm.is_opt_in,
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
                //TODO: Implement new incoming contact
            }
        } else {
            nebimCustomer = await this.#addCustomerAddress(nebimCustomer, customerNebimAddress)
        }

        console.log(nebimCustomer.PostalAddressesWithContacts.filter(x => x.Address === address.address_text)[0]);

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
}