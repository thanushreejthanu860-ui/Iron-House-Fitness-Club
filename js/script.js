const planBenefitsByName = {
    monthly: ["Full gym access", "Standard equipment access", "Basic fitness assessment", "Locker facility"],
    quarterly: ["Full gym access", "All equipment access", "Fitness assessment", "Basic trainer guidance", "Locker facility"],
    yearly: ["Full gym access", "Premium equipment access", "Regular fitness assessment", "Trainer guidance", "Locker facility", "Priority support"]
};

const navigationToggle = document.querySelector(".nav-toggle");
const primaryNavigation = document.getElementById("primary-navigation");

if (navigationToggle && primaryNavigation) {
    function setNavigationOpen(isOpen) {
        navigationToggle.setAttribute("aria-expanded", String(isOpen));
        navigationToggle.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
        primaryNavigation.classList.toggle("is-open", isOpen);
    }

    navigationToggle.addEventListener("click", function () {
        setNavigationOpen(navigationToggle.getAttribute("aria-expanded") !== "true");
    });

    primaryNavigation.addEventListener("click", function (event) {
        if (event.target.closest("a")) setNavigationOpen(false);
    });

    document.addEventListener("click", function (event) {
        if (!event.target.closest("header") && navigationToggle.getAttribute("aria-expanded") === "true") {
            setNavigationOpen(false);
        }
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && navigationToggle.getAttribute("aria-expanded") === "true") {
            setNavigationOpen(false);
            navigationToggle.focus();
        }
    });

    window.addEventListener("resize", function () {
        if (window.innerWidth > 1024) setNavigationOpen(false);
    });
}

async function apiRequest(url, options = {}) {
    let response;

    try {
        response = await fetch(url, {
            ...options,
            headers: {
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...options.headers
            }
        });
    } catch (error) {
        const networkError = new Error("Database connection failed.");
        networkError.status = 503;
        throw networkError;
    }

    let result;
    try {
        result = await response.json();
    } catch (error) {
        result = {};
    }

    if (!response.ok) {
        const requestError = new Error(result.message || "Request failed.");
        requestError.status = response.status;
        throw requestError;
    }

    return result;
}

function getPlanName(plan) {
    return plan.planName || plan.plan_name || "Membership plan";
}

function getPlanId(plan) {
    return Number(plan.planId || plan.plan_id);
}

function getPlanDuration(plan) {
    return Number(plan.durationMonths || plan.duration_months || 0);
}

function getPlanPrice(plan) {
    return Number(plan.price || 0);
}

function getPlanBenefits(plan) {
    const planKey = getPlanName(plan).toLowerCase();
    return planBenefitsByName[planKey] || (plan.description ? [plan.description] : ["Full gym access"]);
}

function setBusy(button, busy, label) {
    if (!button) {
        return;
    }
    if (busy) {
        button.dataset.originalText = button.textContent;
        button.disabled = true;
        button.textContent = label;
    } else {
        button.disabled = false;
        if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    }
}

const memberForm = document.getElementById("memberForm");

if (memberForm) {
    const planSelect = document.getElementById("member-plan");
    const memberError = document.getElementById("member-error");
    const submitButton = memberForm.querySelector('[type="submit"]');
    const planPreview = {
        name: document.getElementById("selected-plan-name"),
        price: document.getElementById("selected-plan-price"),
        duration: document.getElementById("selected-plan-duration"),
        benefits: document.getElementById("selected-plan-benefits")
    };
    let plans = [];

    function updateMemberPlanPreview() {
        const plan = plans.find(item => String(getPlanId(item)) === planSelect.value);
        if (!plan) {
            planPreview.name.textContent = "Choose a plan";
            planPreview.price.textContent = "₹ --";
            planPreview.duration.textContent = "Select a plan to see its duration.";
            return;
        }

        planPreview.name.textContent = getPlanName(plan);
        planPreview.price.textContent = `₹${getPlanPrice(plan).toLocaleString("en-IN")}`;
        planPreview.duration.textContent = `${getPlanDuration(plan)} ${getPlanDuration(plan) === 1 ? "Month" : "Months"}`;
        planPreview.benefits.replaceChildren();
        getPlanBenefits(plan).slice(0, 4).forEach(function (benefit) {
            const item = document.createElement("li");
            item.textContent = benefit;
            planPreview.benefits.appendChild(item);
        });
    }

    async function loadMemberPlans() {
        try {
            plans = await apiRequest("/api/plans");
            planSelect.replaceChildren(new Option("Choose your plan", ""));
            plans.forEach(function (plan) {
                const duration = getPlanDuration(plan);
                const option = new Option(
                    `${getPlanName(plan)} - ₹${getPlanPrice(plan).toLocaleString("en-IN")} - ${duration} ${duration === 1 ? "Month" : "Months"}`,
                    String(getPlanId(plan))
                );
                planSelect.appendChild(option);
            });
        } catch (error) {
            memberError.textContent = "Database connection failed.";
        }
    }

    planSelect.addEventListener("change", updateMemberPlanPreview);
    loadMemberPlans();

    memberForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        memberError.textContent = "";

        const name = document.getElementById("name").value.trim();
        const phone = document.getElementById("phone").value.trim();
        const emailInput = document.getElementById("email");
        const email = emailInput.value.trim();
        const age = Number(document.getElementById("age").value);
        const gender = document.getElementById("gender").value;
        const plan = plans.find(item => String(getPlanId(item)) === planSelect.value);

        if (!name || !phone || !email || !gender || !plan) {
            memberError.textContent = "Please complete all fields and select a membership plan.";
            return;
        }
        if (!/^[0-9+() -]{10,16}$/.test(phone) || phone.replace(/\D/g, "").length < 10 || phone.replace(/\D/g, "").length > 15) {
            memberError.textContent = "Enter a valid phone number with 10 to 15 digits.";
            return;
        }
        if (!emailInput.checkValidity()) {
            memberError.textContent = "Enter a valid email address.";
            return;
        }
        if (!Number.isInteger(age) || age < 15 || age > 80) {
            memberError.textContent = "Age must be between 15 and 80.";
            return;
        }

        setBusy(submitButton, true, "Registering...");
        try {
            const result = await apiRequest("/api/members", {
                method: "POST",
                body: JSON.stringify({
                    name,
                    phone,
                    email,
                    age,
                    gender,
                    plan_id: getPlanId(plan)
                })
            });
            const selectedPlan = result.selectedPlan || plan;
            const selectedName = getPlanName(selectedPlan);
            const selectedPrice = getPlanPrice(selectedPlan);
            const selectedDuration = getPlanDuration(selectedPlan);

            document.getElementById("confirmation-name").textContent = name;
            document.getElementById("confirmation-email").textContent = email;
            document.getElementById("confirmation-plan").textContent = selectedName;
            document.getElementById("confirmation-price").textContent = `₹${selectedPrice.toLocaleString("en-IN")}`;
            document.getElementById("confirmation-duration").textContent = `${selectedDuration} ${selectedDuration === 1 ? "Month" : "Months"}`;
            document.getElementById("continue-to-payment").href = `payment.html?member=${encodeURIComponent(result.memberId)}`;

            const emailBody = [
                "Welcome to Iron House Fitness Club!", "",
                "Thank you for your registration as a member.", "",
                "Your selected membership plan is:", selectedName, "",
                "Plan Price:", `₹${selectedPrice.toLocaleString("en-IN")}`, "",
                "Duration:", `${selectedDuration} ${selectedDuration === 1 ? "Month" : "Months"}`, "",
                "Please complete your payment to activate your membership.", "",
                "Thank you,", "Iron House Fitness Club"
            ].join("\n");
            document.getElementById("email-draft-link").href = `mailto:${email}?subject=${encodeURIComponent("Welcome to Iron House Fitness Club")}&body=${encodeURIComponent(emailBody)}`;
            document.getElementById("registration-confirmation").hidden = false;
            memberForm.closest(".member-layout").hidden = true;
            document.getElementById("registration-confirmation").scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (error) {
            memberError.textContent = error.status === 503 ? "Database connection failed." : "Unable to register member. Please try again.";
        } finally {
            setBusy(submitButton, false);
        }
    });
}

const paymentForm = document.getElementById("paymentForm");

if (paymentForm) {
    const memberSelect = document.getElementById("payment-member");
    const planSelect = document.getElementById("plan");
    const paymentDate = document.getElementById("payment-date");
    const amountInput = document.getElementById("amount");
    const feedback = document.getElementById("payment-feedback");
    const submitButton = paymentForm.querySelector('[type="submit"]');
    let members = [];
    let plans = [];

    function updatePaymentAmount() {
        const plan = plans.find(item => String(getPlanId(item)) === planSelect.value);
        amountInput.value = plan ? getPlanPrice(plan) : "";
    }

    async function loadPaymentOptions() {
        try {
            [members, plans] = await Promise.all([
                apiRequest("/api/members"),
                apiRequest("/api/plans")
            ]);

            memberSelect.replaceChildren(new Option("Select Member", ""));
            members.forEach(function (member) {
                memberSelect.appendChild(new Option(member.name, String(member.memberId)));
            });

            planSelect.replaceChildren(new Option("Select Plan", ""));
            plans.forEach(function (plan) {
                planSelect.appendChild(new Option(
                    `${getPlanName(plan)} - ₹${getPlanPrice(plan).toLocaleString("en-IN")}`,
                    String(getPlanId(plan))
                ));
            });

            const requestedMember = new URLSearchParams(window.location.search).get("member");
            const selectedMember = members.find(member => String(member.memberId) === requestedMember);
            if (selectedMember) {
                memberSelect.value = String(selectedMember.memberId);
                if (selectedMember.planId !== null && selectedMember.planId !== undefined) {
                    planSelect.value = String(selectedMember.planId);
                }
            }
            updatePaymentAmount();
        } catch (error) {
            feedback.textContent = "Database connection failed.";
        }
    }

    memberSelect.addEventListener("change", function () {
        const member = members.find(item => String(item.memberId) === memberSelect.value);
        if (member && member.planId !== null && member.planId !== undefined) {
            planSelect.value = String(member.planId);
        }
        updatePaymentAmount();
    });
    planSelect.addEventListener("change", updatePaymentAmount);

    const today = new Date();
    paymentDate.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    loadPaymentOptions();

    paymentForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        feedback.textContent = "";
        const plan = plans.find(item => String(getPlanId(item)) === planSelect.value);
        const amount = Number(amountInput.value);

        if (!memberSelect.value || !plan || !paymentDate.value || amount !== getPlanPrice(plan)) {
            feedback.textContent = "Select a registered member, plan, and payment date.";
            return;
        }

        setBusy(submitButton, true, "Recording...");
        try {
            const result = await apiRequest("/api/payments", {
                method: "POST",
                body: JSON.stringify({
                    member_id: Number(memberSelect.value),
                    plan_id: getPlanId(plan),
                    payment_date: paymentDate.value,
                    amount,
                    payment_status: "PAID"
                })
            });
            feedback.textContent = result.message || "Payment recorded successfully!";
        } catch (error) {
            feedback.textContent = error.status === 503 ? "Database connection failed." : "Unable to record payment.";
        } finally {
            setBusy(submitButton, false);
        }
    });
}

function searchPayment() {
    const searchInput = document.getElementById("search");
    const table = document.getElementById("paymentTable");
    if (!searchInput || !table) return;

    const searchValue = searchInput.value.trim().toLowerCase();
    const rows = table.getElementsByTagName("tr");
    for (let index = 1; index < rows.length; index += 1) {
        const memberName = rows[index].getElementsByTagName("td")[1];
        if (memberName) {
            rows[index].style.display = memberName.textContent.toLowerCase().includes(searchValue) ? "" : "none";
        }
    }
}

const revealItems = document.querySelectorAll(".home-page [data-reveal]");
if (revealItems.length && "IntersectionObserver" in window) {
    document.body.classList.add("reveal-ready");
    const revealObserver = new IntersectionObserver(function (entries, observer) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12 });
    revealItems.forEach(item => revealObserver.observe(item));
}

const equipmentDetails = {
    treadmill: { title: "Treadmill", image: "https://images.unsplash.com/photo-1593079831268-3381b0db4a77?auto=format&fit=crop&w=1000&q=85", imageAlt: "Empty gym cardio and treadmill equipment", purpose: "Cardio equipment used for walking, jogging and running.", uses: ["Speed adjustment", "Incline options", "Cardio workout", "Calorie tracking"], benefits: "Supports stamina and cardiovascular fitness.", safety: "Start at a comfortable pace and increase speed gradually." },
    "exercise-bike": { title: "Exercise Bike", image: "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&w=1000&q=85", imageAlt: "Unoccupied gym cardio equipment", purpose: "Low-impact cardio and lower-body training.", uses: ["Adjustable resistance", "Comfortable seating", "Cardio training", "Low-impact exercise"], benefits: "Builds endurance with controlled, low-impact cycling.", safety: "Adjust the seat before starting and begin with low resistance." },
    dumbbells: { title: "Dumbbells", image: "https://images.unsplash.com/photo-1576678927484-cc907957088c?auto=format&fit=crop&w=1000&q=85", imageAlt: "Dumbbells arranged on a rack", purpose: "Free weights for strength training and muscle development.", uses: ["Different weight options", "Arm training", "Shoulder training", "Full-body exercises"], benefits: "Support versatile strength exercises.", safety: "Choose a manageable weight and return weights to the rack." },
    "bench-press": { title: "Bench Press", image: "https://images.unsplash.com/photo-1590487988256-9ed24133863e?auto=format&fit=crop&w=1000&q=85", imageAlt: "Unoccupied weight bench and strength equipment", purpose: "Chest, shoulder and upper-body strength training.", uses: ["Chest workouts", "Upper-body training", "Adjustable support", "Strength development"], benefits: "Supports progressive upper-body pushing exercises.", safety: "Set the bench securely and use appropriate safety stops." },
    "cable-machine": { title: "Cable Machine", image: "https://images.unsplash.com/photo-1540497077202-7c8a3999166f?auto=format&fit=crop&w=1000&q=85", imageAlt: "Empty gym strength equipment", purpose: "Versatile equipment for controlled resistance exercises.", uses: ["Adjustable resistance", "Multiple exercise options", "Upper-body training", "Full-body workouts"], benefits: "Provides steady resistance for many movement options.", safety: "Check the cable and attachment, secure the pin, and move with control." },
    "leg-press": { title: "Leg Press", image: "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&w=1000&q=85", imageAlt: "Unoccupied strength machines in a gym", purpose: "Equipment focused on strengthening the lower body.", uses: ["Leg training", "Quadriceps workout", "Hamstring workout", "Controlled resistance"], benefits: "Trains major lower-body muscles with guided movement.", safety: "Set the seat and safety stops before loading; avoid locking the knees." }
};

const planDetailsByName = {
    monthly: { suitable: "Beginners and short-term users.", gymAccess: "Full gym access during the membership period.", equipmentAccess: "Standard equipment access, including cardio and strength areas.", trainerSupport: "Basic fitness guidance.", fitnessAssessment: "Basic fitness assessment included.", lockerFacility: "Locker facility included.", otherBenefits: "Flexible monthly membership." },
    quarterly: { suitable: "Regular gym members building a consistent routine.", gymAccess: "Full gym access during the membership period.", equipmentAccess: "Access to all standard gym equipment.", trainerSupport: "Basic trainer guidance.", fitnessAssessment: "Fitness assessment included.", lockerFacility: "Locker facility included.", otherBenefits: "Three months of consistent access and support." },
    yearly: { suitable: "Members committed to long-term fitness goals.", gymAccess: "Full gym access during the membership period.", equipmentAccess: "Premium equipment access.", trainerSupport: "Trainer guidance throughout your membership.", fitnessAssessment: "Regular fitness assessments.", lockerFacility: "Locker facility included.", otherBenefits: "Priority support." }
};

function appendDetailBlock(container, headingText, value) {
    const block = document.createElement("section");
    block.className = "dialog-detail-block";
    const heading = document.createElement("h3");
    heading.textContent = headingText;
    block.appendChild(heading);

    if (Array.isArray(value)) {
        const list = document.createElement("ul");
        value.forEach(function (item) {
            const listItem = document.createElement("li");
            listItem.textContent = item;
            list.appendChild(listItem);
        });
        block.appendChild(list);
    } else {
        const paragraph = document.createElement("p");
        paragraph.textContent = value || "Not specified.";
        block.appendChild(paragraph);
    }
    container.appendChild(block);
}

function makePlanDetails(plan) {
    const key = getPlanName(plan).toLowerCase();
    const defaults = planDetailsByName[key] || {};
    const duration = getPlanDuration(plan);
    return {
        title: getPlanName(plan),
        price: `₹${getPlanPrice(plan).toLocaleString("en-IN")}`,
        duration: `${duration} ${duration === 1 ? "Month" : "Months"}`,
        suitable: defaults.suitable || "Members whose goals match this plan.",
        gymAccess: defaults.gymAccess || "As described for this membership.",
        equipmentAccess: defaults.equipmentAccess || plan.description || "Contact the gym for details.",
        trainerSupport: defaults.trainerSupport || "Contact the gym for details.",
        fitnessAssessment: defaults.fitnessAssessment || "Contact the gym for details.",
        lockerFacility: defaults.lockerFacility || "Contact the gym for details.",
        otherBenefits: defaults.otherBenefits || plan.description || "No additional benefits specified."
    };
}

function showPlanDetails(details) {
    const dialog = document.getElementById("plan-details-dialog");
    if (!dialog) return;
    document.getElementById("plan-dialog-title").textContent = details.title;
    const content = document.getElementById("plan-dialog-content");
    content.replaceChildren();
    [
        ["Plan Name", details.title], ["Duration", details.duration], ["Price", details.price],
        ["Suitable For", details.suitable], ["Gym Access", details.gymAccess],
        ["Equipment Access", details.equipmentAccess], ["Trainer Support", details.trainerSupport],
        ["Fitness Assessment", details.fitnessAssessment], ["Locker Facility", details.lockerFacility],
        ["Other Benefits", details.otherBenefits]
    ].forEach(detail => appendDetailBlock(content, detail[0], detail[1]));
    dialog.showModal();
}

function showEquipmentDetails(equipment) {
    const dialog = document.getElementById("equipment-details-dialog");
    if (!dialog) return;
    document.getElementById("equipment-dialog-title").textContent = equipment.title;
    const image = document.getElementById("equipment-dialog-image");
    image.src = equipment.image;
    image.alt = equipment.imageAlt;
    const content = document.getElementById("equipment-dialog-content");
    content.replaceChildren();
    appendDetailBlock(content, "Purpose", equipment.purpose);
    appendDetailBlock(content, "Main Uses", equipment.uses);
    appendDetailBlock(content, "Benefits", equipment.benefits);
    appendDetailBlock(content, "Safety / Basic Usage", equipment.safety);
    dialog.showModal();
}

function buildPlanCard(plan, detailKey) {
    const card = document.createElement("article");
    card.className = "membership-card";

    const kicker = document.createElement("p");
    kicker.className = "plan-kicker";
    kicker.textContent = "MEMBERSHIP PLAN";
    const heading = document.createElement("h3");
    heading.textContent = getPlanName(plan);
    const durationText = document.createElement("p");
    durationText.className = "plan-duration";
    const months = getPlanDuration(plan);
    durationText.textContent = `${months} ${months === 1 ? "Month" : "Months"}`;
    const price = document.createElement("p");
    price.className = "plan-price";
    const currency = document.createElement("span");
    currency.textContent = "₹";
    price.append(currency, document.createTextNode(getPlanPrice(plan).toLocaleString("en-IN")));
    const benefits = document.createElement("ul");
    benefits.className = "plan-benefits";
    getPlanBenefits(plan).forEach(function (benefit) {
        const item = document.createElement("li");
        item.textContent = benefit;
        benefits.appendChild(item);
    });
    const suitable = document.createElement("p");
    suitable.className = "plan-suitable";
    const suitableLabel = document.createElement("span");
    suitableLabel.textContent = "SUITABLE FOR";
    suitable.append(suitableLabel, makePlanDetails(plan).suitable);
    const button = document.createElement("button");
    button.className = "plans-button plans-button-outline";
    button.type = "button";
    button.dataset.planDetails = detailKey;
    button.textContent = "View Plan Details";
    card.append(kicker, heading, durationText, price, benefits, suitable, button);
    return card;
}

const plansPage = document.querySelector(".plans-page");

if (plansPage) {
    const planDialog = document.getElementById("plan-details-dialog");
    const equipmentDialog = document.getElementById("equipment-details-dialog");
    const addPlanDialog = document.getElementById("add-plan-dialog");
    const addPlanForm = document.getElementById("add-plan-form");
    const membershipGrid = document.getElementById("membership-grid");
    const planFeedback = document.getElementById("plan-feedback");
    const detailsByKey = {};
    let plans = [];

    async function loadPlans() {
        try {
            plans = await apiRequest("/api/plans");
            const cards = [...membershipGrid.querySelectorAll(".membership-card")];
            const matched = new Set();

            plans.forEach(function (plan) {
                const key = String(getPlanId(plan));
                detailsByKey[key] = makePlanDetails(plan);
                const planName = getPlanName(plan).toLowerCase();
                let card = cards.find(item => !matched.has(item) && item.querySelector("h3")?.textContent.toLowerCase().replace(/\s+plan$/, "") === planName);

                if (card) {
                    matched.add(card);
                    card.dataset.planId = key;
                    const detailButton = card.querySelector("[data-plan-details]");
                    if (detailButton) detailButton.dataset.planDetails = key;
                    const duration = card.querySelector(".plan-duration");
                    if (duration) {
                        const months = getPlanDuration(plan);
                        duration.textContent = `${months} ${months === 1 ? "Month" : "Months"}`;
                    }
                    const price = card.querySelector(".plan-price");
                    if (price) {
                        const currency = price.querySelector("span");
                        price.replaceChildren(currency || document.createElement("span"), document.createTextNode(getPlanPrice(plan).toLocaleString("en-IN")));
                        if (currency) currency.textContent = "₹";
                    }
                } else {
                    membershipGrid.appendChild(buildPlanCard(plan, key));
                }
            });
        } catch (error) {
            planFeedback.textContent = "Database connection failed.";
        }
    }

    loadPlans();

    plansPage.addEventListener("click", function (event) {
        const planButton = event.target.closest("[data-plan-details]");
        if (planButton) {
            const details = detailsByKey[planButton.dataset.planDetails];
            if (details) showPlanDetails(details);
        }

        const equipmentButton = event.target.closest("[data-equipment-details]");
        if (equipmentButton && equipmentDetails[equipmentButton.dataset.equipmentDetails]) {
            showEquipmentDetails(equipmentDetails[equipmentButton.dataset.equipmentDetails]);
        }

        if (event.target.closest("[data-open-add-plan]")) {
            planFeedback.textContent = "";
            addPlanForm.reset();
            addPlanDialog.showModal();
        }

        const closeButton = event.target.closest("[data-dialog-close]");
        if (closeButton) {
            const dialog = closeButton.closest("dialog");
            if (dialog && dialog.open) dialog.close();
        }
    });

    addPlanForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (!addPlanForm.reportValidity()) return;

        const formData = new FormData(addPlanForm);
        const description = [
            String(formData.get("description")).trim(),
            `Equipment access: ${String(formData.get("equipment")).trim()}`,
            `Trainer support: ${String(formData.get("trainerSupport")).trim()}`,
            `Fitness assessment: ${String(formData.get("assessment"))}`,
            `Other benefits: ${String(formData.get("benefits")).trim()}`
        ].join("\n");
        const submitButton = addPlanForm.querySelector('[type="submit"]');
        setBusy(submitButton, true, "Adding...");

        try {
            const response = await apiRequest("/api/plans", {
                method: "POST",
                body: JSON.stringify({
                    plan_name: String(formData.get("planName")).trim(),
                    duration_months: Number(formData.get("duration")),
                    price: Number(formData.get("price")),
                    description
                })
            });
            const createdPlan = response.plan;
            const detailKey = String(createdPlan.planId);
            detailsByKey[detailKey] = makePlanDetails(createdPlan);
            plans.push(createdPlan);
            membershipGrid.appendChild(buildPlanCard(createdPlan, detailKey));
            addPlanForm.reset();
            addPlanDialog.close();
            planFeedback.textContent = response.message || "New membership plan added successfully!";
        } catch (error) {
            planFeedback.textContent = error.status === 503 ? "Database connection failed." : "Unable to add plan. Please try again.";
        } finally {
            setBusy(submitButton, false);
        }
    });

    [planDialog, equipmentDialog, addPlanDialog].forEach(function (dialog) {
        dialog.addEventListener("click", function (event) {
            if (event.target === dialog) dialog.close();
        });
        dialog.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                event.preventDefault();
                dialog.close();
            }
        });
    });
    addPlanDialog.addEventListener("close", () => addPlanForm.reset());
}

const historyPage = document.querySelector(".history-page");

if (historyPage) {
    const metrics = {
        totalMembers: ["total-members", "overview-total"],
        paidMembers: ["paid-members", "overview-paid"],
        pendingPayments: ["pending-members", "overview-pending"],
        totalPaidAmount: ["total-revenue", "overview-revenue"]
    };
    Object.values(metrics).flat().forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = "—";
    });
    document.getElementById("overview-date").textContent = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

    async function loadDashboard() {
        try {
            const [summary, payments] = await Promise.all([
                apiRequest("/api/dashboard"),
                apiRequest("/api/payment-details")
            ]);
            const values = {
                totalMembers: summary.totalMembers,
                paidMembers: summary.paidMembers,
                pendingPayments: summary.pendingPayments,
                totalPaidAmount: `₹${Number(summary.totalPaidAmount).toLocaleString("en-IN")}`
            };
            Object.entries(metrics).forEach(([key, ids]) => ids.forEach(id => {
                const element = document.getElementById(id);
                if (element) element.textContent = values[key];
            }));

            const rows = document.getElementById("dashboard-payment-rows");
            rows.replaceChildren();
            if (!payments.length) {
                const row = document.createElement("tr");
                row.className = "empty-row";
                const cell = document.createElement("td");
                cell.colSpan = 5;
                cell.textContent = "No payment records found.";
                row.appendChild(cell);
                rows.appendChild(row);
            } else {
                payments.forEach(function (payment) {
                    const row = document.createElement("tr");
                    [payment.memberName, payment.planName, payment.paymentStatus, payment.paymentDate, `₹${Number(payment.amount).toLocaleString("en-IN")}`].forEach(function (value, index) {
                        const cell = document.createElement("td");
                        cell.textContent = value ?? "—";
                        if (index === 2) {
                            const badge = document.createElement("span");
                            const paid = String(value).toUpperCase() === "PAID";
                            badge.className = `payment-status ${paid ? "payment-status-paid" : "payment-status-pending"}`;
                            badge.textContent = value ?? "PENDING";
                            cell.replaceChildren(badge);
                        }
                        row.appendChild(cell);
                    });
                    rows.appendChild(row);
                });
            }
        } catch (error) {
            document.getElementById("dashboard-data-note").textContent = "Database connection failed.";
        }
    }

    loadDashboard();
}
