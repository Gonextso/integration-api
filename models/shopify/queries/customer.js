export default {
  findByContact: `
query FindCustomerByContact($query: String!) {
  customers(first: 2, query: $query) {
    nodes {
      id
      email
      phone
    }
  }
}`,
};
