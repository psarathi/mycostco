// Costco Receipt Finder Content Script
// Handles same-origin API requests from the popup to avoid CORS/403 and promise serialization errors.

console.log('Costco Receipt Finder content script loaded.');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchReceipts') {
    const { start, end, idToken, clientID } = request;

    performFetch(start, end, idToken, clientID)
      .then(receipts => {
        sendResponse({ success: true, receipts });
      })
      .catch(err => {
        console.error('Fetch in content script failed:', err);
        sendResponse({ success: false, error: err.message || String(err) });
      });
      
    return true; // Keep channel open for async response
  }
});

async function performFetch(start, end, idToken, clientID) {
  const cleanToken = idToken.replace(/^Bearer\s+/i, '');

  const query = `
    query receipts($startDate: String!, $endDate: String!) {
      receipts(startDate: $startDate, endDate: $endDate) {
        warehouseName
        documentType
        transactionDateTime
        transactionDate
        companyNumber
        warehouseNumber
        operatorNumber
        warehouseShortName
        registerNumber
        transactionNumber
        transactionType
        transactionBarcode
        total
        warehouseAddress1
        warehouseAddress2
        warehouseCity
        warehouseState
        warehouseCountry
        warehousePostalCode
        totalItemCount
        subTotal
        taxes
        itemArray {
          itemNumber
          itemDescription01
          frenchItemDescription1
          itemDescription02
          frenchItemDescription2
          itemIdentifier
          unit
          amount
          taxFlag
          merchantID
          entryMethod
        }
        tenderArray {
          tenderTypeCode
          tenderDescription
          amountTender
          displayAccountNumber
          sequenceNumber
          approvalNumber
          responseCode
          transactionID
          merchantID
          entryMethod
        }
        couponArray {
          upcnumberCoupon
          voidflagCoupon
          refundflagCoupon
          taxflagCoupon
          amountCoupon
        }
        subTaxes {
          tax1
          tax2
          tax3
          tax4
          aTaxPercent
          aTaxLegend
          aTaxAmount
          bTaxPercent
          bTaxLegend
          bTaxAmount
          cTaxPercent
          cTaxLegend
          cTaxAmount
          dTaxAmount
        }
        instantSavings
        membershipNumber
      }
    }
  `.replace(/\s+/g, ' ');

  const response = await fetch('https://ecom-api.costco.com/ebusiness/order/v1/orders/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json-patch+json',
      'Costco.Env': 'ecom',
      'Costco.Service': 'restOrders',
      'Costco-X-Wcs-Clientid': clientID,
      'Client-Identifier': '481b1aec-aa3b-454b-b81b-48187e28f205',
      'Costco-X-Authorization': 'Bearer ' + cleanToken
    },
    body: JSON.stringify({
      query,
      variables: {
        startDate: start,
        endDate: end
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Costco API HTTP status ${response.status}`);
  }

  const json = await response.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors[0].message || 'GraphQL Query Error');
  }

  return json.data?.receipts || [];
}
