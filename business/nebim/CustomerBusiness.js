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
            AddressTypeCode: this.tenant.nebim.customer.addressType, //TODO: must get from configuration
            CountryCode: addressCodes.CountryCode,
            StateCode: addressCodes.StateCode,
            CityCode: addressCodes.CityCode,
            DistrictCode: addressCodes.DistrictCode,
            Address: address.address_text
        };

        const base = {
            ModelType: 3,
            FirstName: customer.first_name,
            LastName: customer.last_name,
            OfficeCode: this.tenant.nebim.order.office,
            DataLanguageCode: "TR",
            IdentityNum: "11111111111",
            AccountOpeningDate: new Date().toISOString(),
            PostalAddresses: [!is_receiver_not_customer ? customerNebimAddress : { AddressTypeCode: this.tenant.nebim.customer.addressType }],
            Communications: [
                {
                    CommunicationTypeCode: "3",
                    CommAddress: customer.email
                },
                {
                    CommunicationTypeCode: this.tenant.nebim.customer.phoneType,
                    CommAddress: customer.phone
                }
            ], //TODO: etk yönetimi
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
            const isContactExists = nebimCustomer.Contacts.some(x => x.FirstName === address.FirstName && x.LastName === address.LastName);

            if (isContactExists) {
                nebimCustomer = await this.#addContactAddress(nebimCustomer, nebimCustomer.Contacts.filter(x => x.FirstName === address.FirstName && x.LastName === address.LastName)[0].ContactID, customerNebimAddress, address.phone);
            } else {
                //TODO: Implement new incoming contact
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
}