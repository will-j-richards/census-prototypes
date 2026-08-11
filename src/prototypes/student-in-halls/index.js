/***********************************************************************************
Student in halls prototype — local address lookup mock + page helpers
************************************************************************************/
import '@ons/prototype-kit/src/helpers/index.js';

const ADDRESSES_URL = '/prototypes/student-in-halls/data/addresses.json';
const API_PREFIX = '/mock-address-api';
const STORAGE_KEY = 'student-in-halls-selected-address';
const MOBILE_STORAGE_KEY = 'student-in-halls-mobile-number';

let addressesPromise = null;

function loadAddresses() {
    if (!addressesPromise) {
        addressesPromise = fetch(ADDRESSES_URL)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to load addresses (${response.status})`);
                }
                return response.json();
            })
            .catch((error) => {
                addressesPromise = null;
                throw error;
            });
    }
    return addressesPromise;
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
        },
    });
}

function normalise(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/,/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function compactPostcode(value) {
    return normalise(value).replace(/\s+/g, '');
}

const FULL_POSTCODE_REGEX =
    /\b((?:(?:gir)|(?:[a-pr-uwyz])(?:(?:[0-9](?:[a-hjkpstuw]|[0-9])?)|(?:[a-hk-y][0-9](?:[0-9]|[abehmnprv-y])?)))) ?([0-9][abd-hjlnp-uw-z]{2})\b/i;

function isFullPostcode(query) {
    return FULL_POSTCODE_REGEX.test(query);
}

function toLookupAddress(address) {
    return {
        uprn: address.uprn,
        formattedAddress: address.formattedAddress,
        addressType: 'PAF',
    };
}

function toRetrieveAddress(address) {
    return {
        uprn: address.uprn,
        formattedAddress: address.formattedAddress,
        addressLine1: address.addressLine1 || '',
        addressLine2: address.addressLine2 || '',
        addressLine3: address.addressLine3 || '',
        townName: address.townName || '',
        postcode: address.postcode || '',
        foundAddressType: 'PAF',
        organisationName: address.organisationName || '',
    };
}

function searchAddresses(addresses, query, limit) {
    const normalisedQuery = normalise(query);
    const compactQuery = compactPostcode(query);

    if (!normalisedQuery) {
        return { results: [], total: 0 };
    }

    const matches = addresses.filter((address) => {
        const haystack = normalise(address.formattedAddress);
        const postcode = compactPostcode(address.postcode);

        return haystack.includes(normalisedQuery) || postcode.includes(compactQuery);
    });

    return {
        results: matches.slice(0, limit).map(toLookupAddress),
        total: matches.length,
    };
}

function groupByPostcode(addresses, query) {
    const compactQuery = compactPostcode(query);
    const matches = addresses.filter((address) => compactPostcode(address.postcode) === compactQuery);

    const groups = new Map();

    matches.forEach((address) => {
        const streetName = address.addressLine2 || address.addressLine1 || '';
        const key = `${address.postcode}|${streetName}|${address.townName}`;

        if (!groups.has(key)) {
            groups.set(key, {
                postcode: address.postcode,
                streetName,
                townName: address.townName,
                postTown: address.townName,
                addressCount: 0,
                firstUprn: Number(address.uprn) || 0,
            });
        }

        const group = groups.get(key);
        group.addressCount += 1;
        if (!group.firstUprn) {
            group.firstUprn = Number(address.uprn) || 0;
        }
    });

    return {
        partpostcode: false,
        groupfullpostcodes: 'combo',
        postcodes: Array.from(groups.values()),
        total: matches.length,
    };
}

function getBucketAddresses(addresses, params) {
    const postcode = compactPostcode(params.get('postcode'));
    const streetName = normalise(params.get('streetname'));
    const townName = normalise(params.get('townname'));

    return addresses
        .filter((address) => {
            const addressStreet = normalise(address.addressLine2 || address.addressLine1 || '');
            return (
                compactPostcode(address.postcode) === postcode &&
                (!streetName || addressStreet === streetName) &&
                (!townName || normalise(address.townName) === townName)
            );
        })
        .map(toLookupAddress);
}

async function handleMockAddressApi(url) {
    const addresses = await loadAddresses();
    const { pathname, searchParams } = url;

    if (pathname.startsWith(`${API_PREFIX}/addresses/eq/uprn/`)) {
        const uprn = pathname.replace(`${API_PREFIX}/addresses/eq/uprn/`, '').replace(/\/$/, '');
        const address = addresses.find((item) => String(item.uprn) === String(uprn));

        if (!address) {
            return jsonResponse({
                status: { code: 404 },
                response: {},
            });
        }

        return jsonResponse({
            status: { code: 200 },
            response: {
                address: toRetrieveAddress(address),
            },
        });
    }

    if (pathname === `${API_PREFIX}/addresses/eq/bucket`) {
        const results = getBucketAddresses(addresses, searchParams);
        return jsonResponse({
            status: { code: 200 },
            response: {
                addresses: results,
                total: results.length,
                limit: results.length,
            },
        });
    }

    if (pathname === `${API_PREFIX}/addresses/eq`) {
        const input = searchParams.get('input') || '';
        const limit = Number(searchParams.get('limit') || 10);
        const groupFullPostcodes = searchParams.get('groupfullpostcodes');

        if (groupFullPostcodes === 'combo' && isFullPostcode(input)) {
            const grouped = groupByPostcode(addresses, input);
            if (grouped.postcodes.length > 1) {
                return jsonResponse({
                    status: { code: 200 },
                    response: {
                        ...grouped,
                        limit,
                    },
                });
            }
        }

        const { results, total } = searchAddresses(addresses, input, limit);
        return jsonResponse({
            status: { code: 200 },
            response: {
                addresses: results,
                total,
                limit,
            },
        });
    }

    return jsonResponse({
        status: { code: 404 },
        response: {},
    });
}

function installMockAddressApi() {
    if (window.__studentInHallsMockInstalled) {
        return;
    }

    window.__studentInHallsMockInstalled = true;
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input, init = {}) => {
        const requestUrl = typeof input === 'string' ? input : input.url;
        const url = new URL(requestUrl, window.location.origin);

        if (url.pathname.startsWith(API_PREFIX)) {
            try {
                return await handleMockAddressApi(url);
            } catch (error) {
                console.error(error);
                return jsonResponse(
                    {
                        status: { code: 500 },
                        response: {},
                    },
                    500,
                );
            }
        }

        return originalFetch(input, init);
    };
}

function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
}

function getSavedAddressFromQuestionManager() {
    const possibleKeys = [
        window.location.pathname.replace(/confirm\.html\/?$/, 'address.html'),
        '/prototypes/student-in-halls/address.html',
        `${window.location.origin}/prototypes/student-in-halls/address.html`,
    ];

    for (const key of Object.keys(sessionStorage)) {
        if (!key.includes('address')) {
            continue;
        }

        try {
            const question = JSON.parse(sessionStorage.getItem(key));
            if (!question || !Array.isArray(question.inputs)) {
                continue;
            }

            const uprnInput = question.inputs.find((input) => input.id && input.id.includes('uprn') && input.value);
            const addressInput = question.inputs.find((input) => input.id && input.id.includes('autosuggest') && input.value);

            if (uprnInput || addressInput) {
                return {
                    uprn: uprnInput ? uprnInput.value : '',
                    addressText: addressInput ? addressInput.value : '',
                    storageKey: key,
                };
            }
        } catch (error) {
            // Ignore unrelated session values.
        }
    }

    for (const key of possibleKeys) {
        const raw = sessionStorage.getItem(key);
        if (!raw) {
            continue;
        }

        try {
            const question = JSON.parse(raw);
            const uprnInput = question.inputs.find((input) => input.id && input.id.includes('uprn') && input.value);
            const addressInput = question.inputs.find((input) => input.id && input.id.includes('autosuggest') && input.value);
            return {
                uprn: uprnInput ? uprnInput.value : '',
                addressText: addressInput ? addressInput.value : '',
                storageKey: key,
            };
        } catch (error) {
            // Ignore invalid JSON.
        }
    }

    return null;
}

function saveSelectedAddress(address) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(address));
}

function readSelectedAddress() {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) {
        return null;
    }

    try {
        return JSON.parse(stored);
    } catch (error) {
        return null;
    }
}

function saveMobileNumber(mobileNumber) {
    localStorage.setItem(MOBILE_STORAGE_KEY, mobileNumber || '');
}

function readMobileNumber() {
    return localStorage.getItem(MOBILE_STORAGE_KEY) || '';
}

function getMobileNumberFromJourney() {
    const fromQuery = getQueryParam('mobile-number');
    if (fromQuery) {
        return fromQuery;
    }

    try {
        const mobileQuestion = JSON.parse(sessionStorage.getItem('/prototypes/student-in-halls/mobile.html') || 'null');
        const mobileInput = mobileQuestion?.inputs?.find((input) => input.id === 'mobile-number');
        if (mobileInput?.value) {
            return mobileInput.value;
        }
    } catch (error) {
        // Ignore invalid session data.
    }

    return readMobileNumber();
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function setupConfirmPage() {
    const midJourneyForm = document.querySelector('.js-confirm-address-form');
    const finalForm = document.querySelector('.js-confirm-address-final-form');
    const form = midJourneyForm || finalForm;
    if (!form) {
        return;
    }

    const isFinalConfirm = Boolean(finalForm);
    const nextUrl = new URL(isFinalConfirm ? './complete.html' : './mobile.html', window.location.href).href;
    const confirmStorageKey = isFinalConfirm
        ? '/prototypes/student-in-halls/confirm-final.html'
        : '/prototypes/student-in-halls/confirm.html';

    // Question Manager can restore a stale form action from an earlier journey step.
    const forceNextAction = () => {
        form.action = nextUrl;

        try {
            const savedQuestion = JSON.parse(sessionStorage.getItem(confirmStorageKey) || 'null');
            if (savedQuestion) {
                savedQuestion.action = nextUrl;
                sessionStorage.setItem(confirmStorageKey, JSON.stringify(savedQuestion));
            }
        } catch (error) {
            // Ignore invalid session data.
        }
    };

    forceNextAction();
    setTimeout(forceNextAction, 0);
    setTimeout(forceNextAction, 50);

    const saved = getSavedAddressFromQuestionManager();
    const uprn = getQueryParam('address-input-uprn') || getQueryParam('uprn') || (saved && saved.uprn);
    const addressText = getQueryParam('address') || (saved && saved.addressText);
    let address = readSelectedAddress();

    if (uprn) {
        const addresses = await loadAddresses();
        address = addresses.find((item) => String(item.uprn) === String(uprn)) || address;
    }

    if (!address && addressText) {
        address = {
            organisationName: '',
            addressLine1: addressText,
            addressLine2: '',
            addressLine3: '',
            townName: '',
            postcode: '',
            formattedAddress: addressText,
            uprn: uprn || '',
        };
    }

    if (!address || (!address.uprn && !address.formattedAddress)) {
        window.location.href = './address.html';
        return;
    }

    saveSelectedAddress(address);

    const output = document.querySelector('.js-confirm-address-output');
    const fallback = document.querySelector('.js-confirm-address-fallback');

    if (output) {
        output.innerHTML = `
            <div class="ons-address-output ons-u-mb-l">
                <p class="ons-address-output__lines">
                    ${address.organisationName ? `<span class="ons-address-output__organisation">${escapeHtml(address.organisationName)}</span><br />` : ''}
                    ${address.addressLine1 ? `<span class="ons-address-output__line1">${escapeHtml(address.addressLine1)}</span><br />` : ''}
                    ${address.addressLine2 ? `<span class="ons-address-output__line2">${escapeHtml(address.addressLine2)}</span><br />` : ''}
                    ${address.addressLine3 ? `<span class="ons-address-output__line3">${escapeHtml(address.addressLine3)}</span><br />` : ''}
                    ${address.townName ? `<span class="ons-address-output__town">${escapeHtml(address.townName)}</span><br />` : ''}
                    ${address.postcode ? `<span class="ons-address-output__postcode">${escapeHtml(address.postcode)}</span>` : ''}
                </p>
            </div>
        `;
        output.hidden = false;
    }

    if (fallback) {
        fallback.hidden = true;
    }

    const uprnInput = document.querySelector('.js-confirm-uprn');
    const addressInput = document.querySelector('.js-confirm-address');
    if (uprnInput) {
        uprnInput.value = address.uprn || '';
    }
    if (addressInput) {
        addressInput.value = address.formattedAddress || '';
    }

    form.addEventListener('submit', (event) => {
        const selected = form.querySelector('input[name="confirm-address"]:checked');
        if (!selected) {
            return;
        }

        if (selected.value === 'no') {
            event.preventDefault();
            window.DONT_SUBMIT = true;
            window.location.href = './address.html';
            return;
        }

        // Ensure "yes" continues to the next step for this confirm screen.
        forceNextAction();
    });
}

function setupAccessCodePage() {
    const form = document.querySelector('.js-access-code-form');
    if (!form) {
        return;
    }

    const confirmFinalUrl = new URL('./confirm-final.html', window.location.href).href;
    const forceConfirmFinalAction = () => {
        form.action = confirmFinalUrl;
    };

    forceConfirmFinalAction();
    setTimeout(forceConfirmFinalAction, 0);
    setTimeout(forceConfirmFinalAction, 50);

    // SMS codes use hyphens (XXXX-XXXX-XXXX-XXXX); normalise before the DS formatter runs.
    const accessCodeInput = form.querySelector('.ons-js-access-code, input[name="access-code"]');
    if (accessCodeInput) {
        accessCodeInput.addEventListener(
            'input',
            () => {
                if (accessCodeInput.value.includes('-')) {
                    accessCodeInput.value = accessCodeInput.value.replace(/-/g, '');
                }
            },
            true,
        );
    }

    form.addEventListener('submit', () => {
        forceConfirmFinalAction();
    });
}

function setupDonePage() {
    const mobileOutput = document.querySelector('.js-text-sent-mobile');
    if (!mobileOutput) {
        return;
    }

    const confirmMobile = getQueryParam('confirm-mobile');
    if (confirmMobile === 'no') {
        window.location.href = './mobile.html';
        return;
    }

    const mobile = getMobileNumberFromJourney();
    if (!mobile) {
        window.location.href = './mobile.html';
        return;
    }

    mobileOutput.textContent = mobile;
}

function setupMobilePage() {
    const form = document.querySelector('form[action*="mobile-confirm.html"]');
    if (!form) {
        return;
    }

    const mobileConfirmUrl = new URL('./mobile-confirm.html', window.location.href).href;
    const forceMobileConfirmAction = () => {
        form.action = mobileConfirmUrl;
    };

    forceMobileConfirmAction();
    setTimeout(forceMobileConfirmAction, 0);
    setTimeout(forceMobileConfirmAction, 50);

    const input = form.querySelector('#mobile-number');
    if (input && !input.value) {
        const savedMobile = readMobileNumber();
        if (savedMobile) {
            input.value = savedMobile;
        }
    }

    form.addEventListener('submit', () => {
        const mobileInput = form.querySelector('#mobile-number');
        if (mobileInput) {
            saveMobileNumber(mobileInput.value.trim());
        }
        forceMobileConfirmAction();
    });
}

function setupMobileConfirmPage() {
    const form = document.querySelector('.js-confirm-mobile-form');
    if (!form) {
        return;
    }

    // Question Manager can restore a stale form action from an earlier journey step.
    const codeSentUrl = new URL('./code-sent.html', window.location.href).href;
    const confirmStorageKey = '/prototypes/student-in-halls/mobile-confirm.html';

    const forceCodeSentAction = () => {
        form.action = codeSentUrl;

        try {
            const savedQuestion = JSON.parse(sessionStorage.getItem(confirmStorageKey) || 'null');
            if (savedQuestion) {
                savedQuestion.action = codeSentUrl;
                sessionStorage.setItem(confirmStorageKey, JSON.stringify(savedQuestion));
            }
        } catch (error) {
            // Ignore invalid session data.
        }
    };

    forceCodeSentAction();
    setTimeout(forceCodeSentAction, 0);
    setTimeout(forceCodeSentAction, 50);

    const mobileNumber = getMobileNumberFromJourney();
    const output = document.querySelector('.js-confirm-mobile-number');
    const fallback = document.querySelector('.js-confirm-mobile-fallback');
    const hiddenInput = document.querySelector('.js-confirm-mobile-input');

    if (!mobileNumber) {
        window.location.href = './mobile.html';
        return;
    }

    saveMobileNumber(mobileNumber);

    if (output) {
        output.textContent = mobileNumber;
    }
    if (fallback) {
        fallback.hidden = true;
    }
    if (hiddenInput) {
        hiddenInput.value = mobileNumber;
    }

    let isSendingAccessCode = false;

    form.addEventListener('submit', async (event) => {
        const selected = form.querySelector('input[name="confirm-mobile"]:checked');
        if (!selected) {
            return;
        }

        if (selected.value === 'no') {
            event.preventDefault();
            window.DONT_SUBMIT = true;
            window.location.href = './mobile.html';
            return;
        }

        // Bypass Question Manager and try GOV.UK Notify — always continue the journey.
        event.preventDefault();
        window.DONT_SUBMIT = true;
        forceCodeSentAction();

        // Guard against double-submit (e.g. double-click) sending multiple texts.
        if (isSendingAccessCode) {
            return;
        }
        isSendingAccessCode = true;

        const submitButton = form.querySelector('button[type="submit"], .ons-btn');
        if (submitButton) {
            submitButton.disabled = true;
        }

        try {
            const response = await fetch('/api/send-access-code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    phoneNumber: mobileNumber,
                }),
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                console.warn('GOV.UK Notify SMS not sent:', payload.error || response.statusText);
            }
        } catch (error) {
            console.warn('GOV.UK Notify SMS not sent:', error.message || error);
        }

        window.location.href = codeSentUrl;
    });
}

function persistAddressQuestion(form, input, uprnInput) {
    const url = window.location.pathname.replace(/\/$/, '');
    const previousLink = document.querySelector('.js-previous');

    const question = {
        title: document.querySelector('h1')?.innerText || 'What is your address?',
        inputs: [
            {
                id: uprnInput.id,
                value: uprnInput.value,
                checked: false,
            },
            {
                id: input.id,
                value: input.value,
                checked: false,
                label: 'Enter address or postcode and select from the results',
            },
        ],
        previousURL: previousLink ? previousLink.getAttribute('href') : undefined,
        originalPreviousURL: previousLink ? previousLink.getAttribute('data-original-href') : undefined,
        url,
        action: form.action,
        hideFromSummary: false,
        multipleLineAnswer: false,
    };

    sessionStorage.setItem(url, JSON.stringify(question));
}

function setupAddressPage() {
    const form = document.querySelector('form[action*="confirm.html"]');
    if (!form) {
        return;
    }

    const input = form.querySelector('.ons-js-autosuggest-input');
    const uprnInput = form.querySelector('.ons-js-hidden-uprn');
    if (!input || !uprnInput) {
        return;
    }

    let selectionCommitted = false;

    const commitSelection = () => {
        if (!uprnInput.value || !input.value) {
            return;
        }

        selectionCommitted = true;
        saveSelectedAddress({
            uprn: uprnInput.value,
            formattedAddress: input.value,
        });
    };

    // Question Manager restores values asynchronously; treat a restored UPRN as selected.
    setTimeout(commitSelection, 0);

    input.addEventListener('input', () => {
        selectionCommitted = false;
        uprnInput.value = '';
    });

    form.addEventListener('click', (event) => {
        if (event.target.closest('[role="option"]')) {
            setTimeout(commitSelection, 150);
        }
    });

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            setTimeout(commitSelection, 150);
        }
    });

    form.addEventListener(
        'submit',
        (event) => {
            const saved = readSelectedAddress();
            const matchesSavedSelection =
                saved &&
                uprnInput.value &&
                input.value &&
                String(saved.uprn) === String(uprnInput.value) &&
                saved.formattedAddress === input.value;

            if (uprnInput.value && input.value && (selectionCommitted || matchesSavedSelection)) {
                event.preventDefault();
                event.stopImmediatePropagation();
                saveSelectedAddress({
                    uprn: uprnInput.value,
                    formattedAddress: input.value,
                });
                persistAddressQuestion(form, input, uprnInput);
                window.location = form.action;
                return;
            }

            // If the design system shows a validation error, stop Question Manager navigation.
            window.DONT_SUBMIT = false;
            setTimeout(() => {
                if (document.querySelector('.ons-js-autosuggest-error-panel')) {
                    window.DONT_SUBMIT = true;
                }
            }, 0);
        },
        true,
    );
}

installMockAddressApi();
setupAddressPage();
setupConfirmPage();
setupAccessCodePage();
setupMobilePage();
setupMobileConfirmPage();
setupDonePage();
