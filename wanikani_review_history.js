// ==UserScript==
// @name         WaniKani Review Answer History DEV
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Displays the history of answers for each item in review sessions
// @author       Wantitled
// @match        https://www.wanikani.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=wanikani.com
// @grant        none
// @license      MIT
// ==/UserScript==

// Checks for Wanikani Open Framework
if (!window.wkof){
    if(
        confirm(` WaniKani Review Answer History requires Wanikani Open Framework.
            Click "OK" to be forwarded to installation instructions.`)){
        window.location.href = 'https://community.wanikani.com/t/instructions-installing-wanikani-open-framework/28549'}
    return;
}

// Inits
let WKAnswerHistory
var observer;
var input;
var itemElem;
const url = window.location.href;
let item, items_by_id;

// Item data only needed for review sessions
if (/\/review\/session+/.test(url)){
    wkof.include('ItemData');
    wkof.ready('ItemData').then(get_history).then(get_items).then(initiate);
} else if (/\/radicals\/+/.test(url) || /\/kanji\/+/.test(url) || /\/vocabulary\/+/.test(url)){
    get_history().then(initiate);
}

// Gets the answer history
async function get_history () {
    if (!wkof.file_cache.dir["WKAnswerHistory"]){
        let WKAnswerHistory = {
            "radicals": {}, "kanji": {}, "vocabulary": {}
        };
        wkof.file_cache.save("WKAnswerHistory", WKAnswerHistory);
    } else {
        WKAnswerHistory = await wkof.file_cache.load("WKAnswerHistory");
    }
}

// Gets item data
async function get_items() {
    item = await wkof.ItemData.get_items('assignments');
    items_by_id = wkof.ItemData.get_index(item, 'subject_id');
}

// Adds the input to the item history object
const addToLocalStorage = (answer, itemType, item, status, language, override) => {
    if (!WKAnswerHistory[itemType][item]){
        WKAnswerHistory[itemType][item] = {
            "answers": [],
            "timestamps": [],
            "itemStatus": [],
            "SRSLevel": [],
            "language": []
        }
    }
    if (!override) {
        let lang;
        if (language === null){
            lang = "en";
        } else {
            lang = "ja";
        }
        WKAnswerHistory[itemType][item].answers.push(answer);
        WKAnswerHistory[itemType][item].timestamps.push(getTimestamp());
        WKAnswerHistory[itemType][item].itemStatus.push(status);
        WKAnswerHistory[itemType][item].SRSLevel.push(getItemSRS("srs"));
        WKAnswerHistory[itemType][item].language.push(lang);
    } else {
        WKAnswerHistory[itemType][item].itemStatus[WKAnswerHistory[itemType][item].itemStatus.length - 1] = status;
    }
    wkof.file_cache.save("WKAnswerHistory", WKAnswerHistory);
}

// Gets time and date of review (seconds are included as the same item can be reviewed a few seconds apart)
const getTimestamp = () => {
    let time = new Date();
    let addZero = (num) => {
        if (String(num).length === 1){
            num = "0" + String(num);
        }
        return num;
    }
    let year = time.getFullYear(); let month = addZero(parseInt(time.getMonth()) + 1); let day = addZero(time.getDate());
    let hours = time.getHours(); let minutes = addZero(time.getMinutes()); let seconds = addZero(time.getSeconds())
    return year + "/" + month + "/" + day + ", " + hours + ":" + minutes + ":" + seconds ;
}

// Gets the current item's SRS level if WKOF is installed
const getItemSRS = (request) => {
    let review_item = $.jStorage.get('currentItem');
    let item = items_by_id[review_item.id];
    if (request === "srs"){
        return getSRSLevel(item);
    } else if (request === "item"){
        return item;
    }
}

// *Actually* gets the current item's SRS level (the level the item is being reviewed at)
const getSRSLevel = (wkof_item) => {return wkof_item?.assignments?.srs_stage ?? -1}

// Status checker checks for a class change on the input field which signifies an answer or an override
const statusChecker = (fieldsetElem, lastClass) => {
    observer = new MutationObserver((mutationsList) => {

        let itemType = itemElem.classList[0];
        let item;
        if (document.getElementById("strokeChar")){
            item = document.getElementById("character").querySelector("span").innerText;
        } else {
            item = itemElem.innerText;
        }
        if (itemType === "radical"){
            item = getItemSRS("item");
        }
        let answer = input.value;
        let lang = input.getAttribute("lang");

        for(let mutation of mutationsList) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                let currentClass = mutation.target.classList[0];
                if (currentClass){
                    if (lastClass === undefined) {
                        lastClass = currentClass
                        switch (currentClass){
                            case "correct": addToLocalStorage(answer, itemType, item, currentClass, lang, false);break;
                            case "incorrect": addToLocalStorage(answer, itemType, item, currentClass, lang, false);break;
                        }
                    } else {
                        switch (currentClass){
                            case "correct": addToLocalStorage(answer, itemType, item, currentClass, lang, true);break;
                            case "incorrect": addToLocalStorage(answer, itemType, item, currentClass, lang, true);break;
                            case "WKO_ignored": addToLocalStorage(answer, itemType, item, currentClass, lang, true);break;
                            default: break;
                        }
                    }
                } else {lastClass = currentClass}
            }}
    });
    observer.observe(fieldsetElem, {attributes: true});
}

// Creates the table headers for the table on the item page
const createHeaders = () => {
    let headers = document.createElement("tr");

    const reviewTypeHeader = document.createElement("th");
    reviewTypeHeader.innerText = "Review Type";

    const answerHeader = document.createElement("th");
    answerHeader.innerText = "Answer";

    const srsHeader = document.createElement("th");
    srsHeader.innerText = "SRS Level";

    const timestampHeader = document.createElement("th");
    timestampHeader.innerText = "Date Answered";

    headers.appendChild(reviewTypeHeader);
    headers.appendChild(answerHeader);
    headers.appendChild(srsHeader);
    headers.appendChild(timestampHeader);
    return headers;
}

// Creates the table rows and inserts the data for the item page table
const buildTable = (itemObj, tbody) => {
    for (let i = itemObj.answers.length - 1; i >= 0; i--){

        let tr = document.createElement("tr");
        tr.style.backgroundColor = getColor(itemObj.itemStatus[i]);
        tr.style.color = "#FFF";

        let ans_td = document.createElement("td");
        ans_td.innerText = itemObj.answers[i];
        if (itemObj.language[i] === "ja"){ans_td.setAttribute("lang", "ja");}
        ans_td.style.textAlign = "center";

        let srs_td = document.createElement("td");
        srs_td.innerText = srs(itemObj.SRSLevel[i]) + " Level";
        srs_td.style.textAlign = "center";

        let date_td = document.createElement("td");
        date_td.innerText = itemObj.timestamps[i];
        date_td.style.textAlign = "center";

        let lang_td = document.createElement("td");
        lang_td.innerText = reviewType(itemObj.language[i]);
        lang_td.style.textAlign = "center";

        tr.appendChild(lang_td);
        tr.appendChild(ans_td);
        tr.appendChild(srs_td);
        tr.appendChild(date_td);
        tbody.appendChild(tr);
    }
}

// Converts the answer status to the corresponding color
const getColor = (status) => {
    switch (status) {
        case "correct": return "#88CC00";break;
        case "incorrect": return "#FF0033"; break;
        case "WKO_ignored": return "#FFCC00"; break;
    }
}

// Converts the language of the item to get the review type
const reviewType = (lang) => {
    if (lang === "ja"){return "Reading"}
    else {return "Meaning"}
}

// Gets the srs level from the srs value
const srs = (srsKey) => {
    switch (srsKey){
        case -1: return "Missing";break;
        case 1: return "Apprentice 1";break;
        case 2: return "Apprentice 2";break;
        case 3: return "Apprentice 3";break;
        case 4: return "Apprentice 4";break;
        case 5: return "Guru 1";break;
        case 6: return "Guru 2";break;
        case 7: return "Master";break;
        case 8: return "Enlightened";break;
        default: return "";break;
    }
}


function initiate() {
    'use strict';

    // Checks for the review page to collect answer data
    if (/\/review\/session+/.test(url)){
        if (document.querySelector('input').classList.contains("popup-input")){
            input = document.querySelectorAll('input')[1];
        } else {input = document.querySelector('input')}
        itemElem = document.getElementById("character");

        let fieldsetElem = input.parentElement;
        let lastClass = fieldsetElem.classList[0];

        statusChecker(fieldsetElem, lastClass);
    }
    // Checks for an item info page to display the data
    if (/\/radicals\/+/.test(url) || /\/kanji\/+/.test(url) || /\/vocabulary\/+/.test(url)){

        console.log(WKAnswerHistory);
        // Gets the page's item from the URL
        const pageItem = decodeURI(url.substring(url.lastIndexOf("/") + 1));
        const itemType = url.substring(url.indexOf("wanikani.com/") + 13, url.lastIndexOf("/"));

        // Adds navigation button to top bar
        const history_li = document.createElement("li");
        const history_a = document.createElement("a");
        history_a.innerText = "Review History";
        history_a.setAttribute("href", "#history");
        history_li.appendChild(history_a);
        if (document.querySelector("[href='#progress']")){
            let progress_li = document.querySelector("[href='#progress']").parentNode;
            document.querySelector(".page-list-header").parentNode.insertBefore(history_li, progress_li);
        } else {
            document.querySelector(".page-list-header").parentNode.appendChild(history_li);
        }

        // Section element for the review history
        const reviewHistorySection = document.createElement("section");
        reviewHistorySection.setAttribute("id", "history");
        reviewHistorySection.style.fontFamily = '"Ubuntu", Helvetica, Arial, sans-serif';
        reviewHistorySection.style.fontSize = "16px";

        // Title for the section
        const sectionHead = document.createElement("h2");
        sectionHead.innerText = "Review History";

        // Table element
        const table = document.createElement("table");
        table.style.width = "100%";
        table.style.lineHeight = "1.5em";

        // Body section of the table
        const tbody = document.createElement("tbody");

        // Headers for the table
        let headers = createHeaders();
        headers.style.position = "sticky";
        headers.style.top = "0";
        headers.style.backgroundColor = "#eee";
        headers.style.boxShadow = "0 2px 2px -1px rgba(0, 0, 0, 0.2)";
        table.appendChild(headers);

        // Table wrapped in a div to allow scrolling when the table is taller than 500px
        const tableDiv = document.createElement("div");

        // Displays the table if item data is found, otherwise displays a messsage
        if (WKAnswerHistory[itemType][pageItem]){
            buildTable(WKAnswerHistory[itemType][pageItem], tbody);
            table.appendChild(tbody);

            tableDiv.style.maxHeight = "500px";
            tableDiv.style.display = "block";
            tableDiv.style.overflowY = "auto";

            tableDiv.appendChild(table);
        } else {
            tableDiv.innerText = ("No answers have been recorded for this item yet.");
            tableDiv.style.color = "#666";
        }
        reviewHistorySection.appendChild(sectionHead);
        reviewHistorySection.appendChild(tableDiv);

        if (itemType === "radicals"){
            document.getElementById("information").parentNode.appendChild(reviewHistorySection);
        } else {
            document.getElementById("meaning").parentNode.appendChild(reviewHistorySection);
        }
    }
};
