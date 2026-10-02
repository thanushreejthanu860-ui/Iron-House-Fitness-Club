async function apiRequest(url, options = {}) {
    let response;
    try {
        response = await fetch(url, {
            ...options,
            headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers }
        });
    } catch (error) {
        const networkError = new Error("Database connection failed.");
        networkError.status = 503;
        throw networkError;
    }

    let payload;
    try {
        payload = await response.json();
    } catch (error) {
        payload = {};
    }
    if (!response.ok) {
        const requestError = new Error(payload.message || "Request failed.");
        requestError.status = response.status;
        throw requestError;
    }
    return payload;
}

function planIdOf(plan) {
    return Number(plan.planId ?? plan.plan_id);
}

function planNameOf(plan) {
    return plan.planName || plan.plan_name || "Membership plan";
}

function planDurationOf(plan) {
    return Number(plan.durationMonths ?? plan.duration_months ?? 0);
}

function planPriceOf(plan) {
    return Number(plan.price || 0);
}

function durationLabel(months) {
    return `${months} ${months === 1 ? "Month" : "Months"}`;
}

function benefitsForPlan(plan) {
    const benefits = {
        monthly: ["Full gym access", "Standard equipment access", "Basic fitness assessment", "Locker facility"],
        quarterly: ["Full gym access", "All equipment access", "Fitness assessment", "Basic trainer guidance", "Locker facility"],
        yearly: ["Full gym access", "Premium equipment access", "Regular fitness assessment", "Trainer guidance", "Locker facility", "Priority support"]
    };
    return benefits[planNameOf(plan).toLowerCase()] || (plan.description ? [plan.description] : ["Full gym access"]);
}

function setButtonBusy(button, busy, label) {
    if (!button) return;
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
    const preview = {
        name: document.getElementById("selected-plan-name"),
        price: document.getElementById("selected-plan-price"),
        duration: document.getElementById("selected-plan-duration"),
        benefits: document.getElementById("selected-plan-benefits")
    };
    let plans = [];

    function updatePlanPreview() {
        const plan = plans.find(item => String(planIdOf(item)) === planSelect.value);
        if (!plan) {
            preview.name.textContent = "Choose a plan";
            preview.price.textContent = "₹ --";
            preview.duration.textContent = "Select a plan to see its duration.";
            return;
        }
        preview.name.textContent = planNameOf(plan);
        preview.price.textContent = `₹${planPriceOf(plan).toLocaleString("en-IN")}`;
        preview.duration.textContent = durationLabel(planDurationOf(plan));
        preview.benefits.replaceChildren();
        benefitsForPlan(plan).slice(0, 4).forEach(text => {
            const item = document.createElement("li");
            item.textContent = text;
            preview.benefits.appendChild(item);
        });
    }

    async function loadPlansForRegistration() {
        try {
            plans = await apiRequest("/api/plans");
            planSelect.replaceChildren(new Option("Choose your plan", ""));
            plans.forEach(plan => {
                const months = planDurationOf(plan);
                planSelect.appendChild(new Option(
                    `${planNameOf(plan)} - ₹${planPriceOf(plan).toLocaleString("en-IN")} - ${durationLabel(months)}`,
                    String(planIdOf(plan))
                ));
            });
        } catch (error) {
            memberError.textContent = "Database connection failed.";
        }
    }

    planSelect.addEventListener("change", updatePlanPreview);
    loadPlansForRegistration();

    memberForm.addEventListener("submit", async event => {
        event.preventDefault();
        memberError.textContent = "";
        const name = document.getElementById("name").value.trim();
        const phone = document.getElementById("phone").value.trim();
        const emailInput = document.getElementById("email");
        const email = emailInput.value.trim();
        const age = Number(document.getElementById("age").value);
        const gender = document.getElementById("gender").value;
        const plan = plans.find(item => String(planIdOf(item)) === planSelect.value);

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

        setButtonBusy(submitButton, true, "Registering...");
        try {
            const result = await apiRequest("/api/members", {
                method: "POST",
                body: JSON.stringify({ name, phone, email, age, gender, plan_id: planIdOf(plan) })
            });
            const selectedPlan = result.selectedPlan || plan;
            const selectedName = planNameOf(selectedPlan);
            const selectedPrice = planPriceOf(selectedPlan);
            const selectedDuration = planDurationOf(selectedPlan);
            document.getElementById("confirmation-name").textContent = name;
            document.getElementById("confirmation-email").textContent = email;
            document.getElementById("confirmation-plan").textContent = selectedName;
            document.getElementById("confirmation-price").textContent = `₹${selectedPrice.toLocaleString("en-IN")}`;
            document.getElementById("confirmation-duration").textContent = durationLabel(selectedDuration);
            document.getElementById("continue-to-payment").href = `payment.html?member=${encodeURIComponent(result.memberId)}`;
            const mailBody = [
                "Welcome to Iron House Fitness Club!", "", "Thank you for your registration as a member.", "",
                "Your selected membership plan is:", selectedName, "", "Plan Price:",
                `₹${selectedPrice.toLocaleString("en-IN")}`, "", "Duration:", durationLabel(selectedDuration), "",
                "Please complete your payment to activate your membership.", "", "Thank you,", "Iron House Fitness Club"
            ].join("\n");
            document.getElementById("email-draft-link").href = `mailto:${email}?subject=${encodeURIComponent("Welcome to Iron House Fitness Club")}&body=${encodeURIComponent(mailBody)}`;
            document.getElementById("registration-confirmation").hidden = false;
            memberForm.closest(".member-layout").hidden = true;
            document.getElementById("registration-confirmation").scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (error) {
            memberError.textContent = error.status === 503 ? "Database connection failed." : "Unable to register member. Please try again.";
        } finally {
            setButtonBusy(submitButton, false);
        }
    });
}

const paymentForm = document.getElementById("paymentForm");
if (paymentForm) {
    const memberSelect = document.getElementById("payment-member");
    const planSelect = document.getElementById("plan");
    const dateInput = document.getElementById("payment-date");
    const amountInput = document.getElementById("amount");
    const feedback = document.getElementById("payment-feedback");
    const submitButton = paymentForm.querySelector('[type="submit"]');
    let members = [];
    let plans = [];

    function refreshAmount() {
        const plan = plans.find(item => String(planIdOf(item)) === planSelect.value);
        amountInput.value = plan ? planPriceOf(plan) : "";
    }

    async function loadPaymentOptions() {
        try {
            [members, plans] = await Promise.all([apiRequest("/api/members"), apiRequest("/api/plans")]);
            memberSelect.replaceChildren(new Option("Select Member", ""));
            members.forEach(member => memberSelect.appendChild(new Option(member.name, String(member.memberId))));
            planSelect.replaceChildren(new Option("Select Plan", ""));
            plans.forEach(plan => planSelect.appendChild(new Option(
                `${planNameOf(plan)} - ₹${planPriceOf(plan).toLocaleString("en-IN")}`,
                String(planIdOf(plan))
            )));

            const requestedId = new URLSearchParams(window.location.search).get("member");
            const selected = members.find(member => String(member.memberId) === requestedId);
            if (selected) {
                memberSelect.value = String(selected.memberId);
                planSelect.value = String(selected.planId);
            }
            refreshAmount();
        } catch (error) {
            feedback.textContent = "Database connection failed.";
        }
    }

    memberSelect.addEventListener("change", () => {
        const member = members.find(item => String(item.memberId) === memberSelect.value);
        if (member) planSelect.value = String(member.planId);
        refreshAmount();
    });
    planSelect.addEventListener("change", refreshAmount);
    const today = new Date();
    dateInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    loadPaymentOptions();

    paymentForm.addEventListener("submit", async event => {
        event.preventDefault();
        feedback.textContent = "";
        const plan = plans.find(item => String(planIdOf(item)) === planSelect.value);
        if (!memberSelect.value || !plan || !dateInput.value || Number(amountInput.value) !== planPriceOf(plan)) {
            feedback.textContent = "Select a registered member, plan, and payment date.";
            return;
        }
        setButtonBusy(submitButton, true, "Recording...");
        try {
            const result = await apiRequest("/api/payments", {
                method: "POST",
                body: JSON.stringify({ member_id: Number(memberSelect.value), plan_id: planIdOf(plan), payment_date: dateInput.value, amount: Number(amountInput.value), payment_status: "PAID" })
            });
            feedback.textContent = result.message || "Payment recorded successfully!";
        } catch (error) {
            feedback.textContent = error.status === 503 ? "Database connection failed." : "Unable to record payment.";
        } finally {
            setButtonBusy(submitButton, false);
        }
    });
}

function searchPayment() {
    const input = document.getElementById("search");
    const table = document.getElementById("paymentTable");
    if (!input || !table) return;
    const query = input.value.trim().toLowerCase();
    const rows = table.getElementsByTagName("tr");
    for (let index = 1; index < rows.length; index += 1) {
        const memberName = rows[index].getElementsByTagName("td")[1];
        if (memberName) rows[index].style.display = memberName.textContent.toLowerCase().includes(query) ? "" : "none";
    }
}

const revealItems = document.querySelectorAll(".home-page [data-reveal]");
if (revealItems.length && "IntersectionObserver" in window) {
    document.body.classList.add("reveal-ready");
    const observer = new IntersectionObserver((entries, currentObserver) => entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            currentObserver.unobserve(entry.target);
        }
    }), { threshold: 0.12 });
    revealItems.forEach(item => observer.observe(item));
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

function appendDetailBlock(container, title, value) {
    const block = document.createElement("section");
    block.className = "dialog-detail-block";
    const heading = document.createElement("h3");
    heading.textContent = title;
    block.appendChild(heading);
    if (Array.isArray(value)) {
        const list = document.createElement("ul");
        value.forEach(text => {
            const item = document.createElement("li");
            item.textContent = text;
            list.appendChild(item);
        });
        block.appendChild(list);
    } else {
        const paragraph = document.createElement("p");
        paragraph.textContent = value || "Not specified.";
        block.appendChild(paragraph);
    }
    container.appendChild(block);
}

function planDetails(plan) {
    const defaults = planDetailsByName[planNameOf(plan).toLowerCase()] || {};
    const months = planDurationOf(plan);
    return {
        title: planNameOf(plan),
        duration: durationLabel(months),
        price: `₹${planPriceOf(plan).toLocaleString("en-IN")}`,
        suitable: defaults.suitable || "Members whose goals match this plan.",
        gymAccess: defaults.gymAccess || "Full gym access during the membership period.",
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
    [["Plan Name", details.title], ["Duration", details.duration], ["Price", details.price], ["Suitable For", details.suitable], ["Gym Access", details.gymAccess], ["Equipment Access", details.equipmentAccess], ["Trainer Support", details.trainerSupport], ["Fitness Assessment", details.fitnessAssessment], ["Locker Facility", details.lockerFacility], ["Other Benefits", details.otherBenefits]].forEach(detail => appendDetailBlock(content, detail[0], detail[1]));
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

function buildPlanCard(plan, key) {
    const card = document.createElement("article");
    card.className = "membership-card";
    const kicker = document.createElement("p");
    kicker.className = "plan-kicker";
    kicker.textContent = "MEMBERSHIP PLAN";
    const heading = document.createElement("h3");
    heading.textContent = planNameOf(plan);
    const duration = document.createElement("p");
    duration.className = "plan-duration";
    duration.textContent = durationLabel(planDurationOf(plan));
    const price = document.createElement("p");
    price.className = "plan-price";
    const currency = document.createElement("span");
    currency.textContent = "₹";
    price.append(currency, document.createTextNode(planPriceOf(plan).toLocaleString("en-IN")));
    const benefits = document.createElement("ul");
    benefits.className = "plan-benefits";
    benefitsForPlan(plan).forEach(text => {
        const item = document.createElement("li");
        item.textContent = text;
        benefits.appendChild(item);
    });
    const suitable = document.createElement("p");
    suitable.className = "plan-suitable";
    const label = document.createElement("span");
    label.textContent = "SUITABLE FOR";
    suitable.append(label, planDetails(plan).suitable);
    const button = document.createElement("button");
    button.className = "plans-button plans-button-outline";
    button.type = "button";
    button.dataset.planDetails = key;
    button.textContent = "View Plan Details";
    card.append(kicker, heading, duration, price, benefits, suitable, button);
    return card;
}

const plansPage = document.querySelector(".plans-page");
if (plansPage) {
    const membershipGrid = document.getElementById("membership-grid");
    const feedback = document.getElementById("plan-feedback");
    const addPlanDialog = document.getElementById("add-plan-dialog");
    const addPlanForm = document.getElementById("add-plan-form");
    const dialogs = [document.getElementById("plan-details-dialog"), document.getElementById("equipment-details-dialog"), addPlanDialog];
    const detailsById = {};
    let plans = [];

    async function loadPlans() {
        try {
            plans = await apiRequest("/api/plans");
            const oldCards = [...membershipGrid.querySelectorAll(".membership-card")];
            const used = new Set();
            plans.forEach(plan => {
                const id = String(planIdOf(plan));
                detailsById[id] = planDetails(plan);
                const normalizedName = planNameOf(plan).toLowerCase();
                const existing = oldCards.find(card => !used.has(card) && card.querySelector("h3")?.textContent.toLowerCase().replace(/\s+plan$/, "") === normalizedName);
                if (existing) {
                    used.add(existing);
                    const button = existing.querySelector("[data-plan-details]");
                    if (button) button.dataset.planDetails = id;
                    const duration = existing.querySelector(".plan-duration");
                    if (duration) duration.textContent = durationLabel(planDurationOf(plan));
                    const price = existing.querySelector(".plan-price");
                    if (price) {
                        const currency = price.querySelector("span") || document.createElement("span");
                        currency.textContent = "₹";
                        price.replaceChildren(currency, document.createTextNode(planPriceOf(plan).toLocaleString("en-IN")));
                    }
                } else {
                    membershipGrid.appendChild(buildPlanCard(plan, id));
                }
            });
        } catch (error) {
            feedback.textContent = "Database connection failed.";
        }
    }
    loadPlans();

    plansPage.addEventListener("click", event => {
        const planButton = event.target.closest("[data-plan-details]");
        if (planButton && detailsById[planButton.dataset.planDetails]) showPlanDetails(detailsById[planButton.dataset.planDetails]);
        const equipmentButton = event.target.closest("[data-equipment-details]");
        if (equipmentButton && equipmentDetails[equipmentButton.dataset.equipmentDetails]) showEquipmentDetails(equipmentDetails[equipmentButton.dataset.equipmentDetails]);
        if (event.target.closest("[data-open-add-plan]")) {
            feedback.textContent = "";
            addPlanForm.reset();
            addPlanDialog.showModal();
        }
        const closeButton = event.target.closest("[data-dialog-close]");
        if (closeButton) closeButton.closest("dialog")?.close();
    });

    addPlanForm.addEventListener("submit", async event => {
        event.preventDefault();
        if (!addPlanForm.reportValidity()) return;
        const form = new FormData(addPlanForm);
        const description = [String(form.get("description")).trim(), `Equipment access: ${String(form.get("equipment")).trim()}`, `Trainer support: ${String(form.get("trainerSupport")).trim()}`, `Fitness assessment: ${form.get("assessment")}`, `Other benefits: ${String(form.get("benefits")).trim()}`].join("\n");
        const button = addPlanForm.querySelector('[type="submit"]');
        setButtonBusy(button, true, "Adding...");
        try {
            const response = await apiRequest("/api/plans", {
                method: "POST",
                body: JSON.stringify({ plan_name: String(form.get("planName")).trim(), duration_months: Number(form.get("duration")), price: Number(form.get("price")), description })
            });
            const plan = response.plan;
            detailsById[String(plan.planId)] = planDetails(plan);
            plans.push(plan);
            membershipGrid.appendChild(buildPlanCard(plan, String(plan.planId)));
            addPlanForm.reset();
            addPlanDialog.close();
            feedback.textContent = response.message || "New membership plan added successfully!";
        } catch (error) {
            feedback.textContent = error.status === 503 ? "Database connection failed." : "Unable to add plan. Please try again.";
        } finally {
            setButtonBusy(button, false);
        }
    });

    dialogs.forEach(dialog => {
        dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
        dialog.addEventListener("keydown", event => {
            if (event.key === "Escape") { event.preventDefault(); dialog.close(); }
        });
    });
    addPlanDialog.addEventListener("close", () => addPlanForm.reset());
}

const historyPage = document.querySelector(".history-page");
if (historyPage) {
    const metricIds = {
        totalMembers: ["total-members", "overview-total"],
        paidMembers: ["paid-members", "overview-paid"],
        pendingPayments: ["pending-members", "overview-pending"],
        totalPaidAmount: ["total-revenue", "overview-revenue"]
    };
    document.getElementById("overview-date").textContent = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

    async function loadDashboard() {
        try {
            const [dashboard, payments] = await Promise.all([apiRequest("/api/dashboard"), apiRequest("/api/payment-details")]);
            const values = {
                totalMembers: dashboard.totalMembers,
                paidMembers: dashboard.paidMembers,
                pendingPayments: dashboard.pendingPayments,
                totalPaidAmount: `₹${Number(dashboard.totalPaidAmount).toLocaleString("en-IN")}`
            };
            Object.entries(metricIds).forEach(([key, ids]) => ids.forEach(id => {
                document.getElementById(id).textContent = values[key];
            }));
            const tbody = document.getElementById("dashboard-payment-rows");
            tbody.replaceChildren();
            if (!payments.length) {
                const row = document.createElement("tr");
                const cell = document.createElement("td");
                row.className = "empty-row";
                cell.colSpan = 5;
                cell.textContent = "No payment records found.";
                row.appendChild(cell);
                tbody.appendChild(row);
            } else {
                payments.forEach(payment => {
                    const row = document.createElement("tr");
                    [payment.memberName, payment.planName, payment.paymentStatus, payment.paymentDate, `₹${Number(payment.amount).toLocaleString("en-IN")}`].forEach((value, index) => {
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
                    tbody.appendChild(row);
                });
            }
        } catch (error) {
            document.getElementById("dashboard-data-note").textContent = "Database connection failed.";
        }
    }
    loadDashboard();
}
