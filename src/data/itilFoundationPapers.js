export const PAPERS = [
  {
    "id": "paper-1",
    "title": "Sample Paper 1",
    "subtitle": "ITIL 4 Foundation",
    "questionCount": 40,
    "passMark": 26,
    "recommendedMinutes": 60,
    "questions": [
      {
        "number": 1,
        "prompt": "Which practice is responsible for moving components to live environments?",
        "choices": {
          "A": "Change enablement",
          "B": "Release management",
          "C": "IT asset management",
          "D": "Deployment management"
        },
        "answer": "D",
        "syllabusRef": "6.1.h",
        "rationale": "A. Incorrect. “The purpose of the change enablement practice is to maximize the number of successful service and product changes by ensuring that risks have been properly assessed, authorizing changes to proceed, and managing the change schedule”. Ref 5.2.4 B. Incorrect. “The purpose of the release management practice is to make new and changed services and features available for use.” Ref 5.2.9 C. Incorrect. “The purpose of the IT asset management practice is to plan and manage the full lifecycle of all IT assets”. Ref 5.2.6 D. Correct. “The purpose of the deployment management practice is to move new or changed hardware, software, documentation, processes, or any other component to live environments.” Ref 5.3.1"
      },
      {
        "number": 2,
        "prompt": "Which practice includes the classification and ownership of queries and requests from users?",
        "choices": {
          "A": "Service desk",
          "B": "Incident management",
          "C": "Change enablement",
          "D": "Service level management"
        },
        "answer": "A",
        "syllabusRef": "7.1.f",
        "rationale": "A. Correct. “Service desks provide a clear path for users to report issues, queries, and requests, and have them acknowledged, classified, owned, and actioned”. Ref 5.2.14 B. Incorrect. The ‘incident management’ practice deals only with incidents, not queries and requests. “The purpose of the incident management practice is to minimize the negative impact of incidents by restoring normal service operation as quickly as possible”. Ref 5.2.5 C. Incorrect. The ‘change enablement’ practice deals only with change requests, not other queries and requests. “The purpose of the change enablement practice is to maximize the number of successful service and product changes by ensuring that risks have been properly assessed, authorizing changes to proceed, and managing the change schedule”. Ref 5.2.4 D. Incorrect. The ‘service level management’ practice ensures service targets are met. It does not manage queries and requests from users. “The purpose of the service level management practice is to set clear business-based targets for service performance, so that the delivery of a service can be properly assessed, monitored, and managed against these targets”. Ref 5.2.15"
      },
      {
        "number": 3,
        "prompt": "Which practice identifies metrics that reflect the customer’s experience of a service?",
        "choices": {
          "A": "Continual improvement",
          "B": "Service desk",
          "C": "Service level management",
          "D": "Problem management"
        },
        "answer": "C",
        "syllabusRef": "7.1.g",
        "rationale": "A. Incorrect. \"The purpose of the continual improvement practice is to align the organization’s practices and services with changing business needs through the ongoing improvement of products, services, and practices, or any element involved in the management of products and services.\" Ref 5.1.2 B. Incorrect. \"The purpose of the service desk practice is to capture demand for incident resolution and service requests. It should also be the entry point and single point of contact for the service provider with all of its users.\" Ref 5.2.14 C. Correct. \"Service level management identifies metrics and measures that are a truthful reflection of the customer’s actual experience and level of satisfaction with the whole service,\" and \"Engagement is needed to understand and confirm the actual ongoing needs and requirements of customers, not simply what is interpreted by the service provider or has been agreed several years before.\" Ref 5.2.15.1 D. Incorrect. \"The purpose of the problem management practice is to reduce the likelihood and impact of incidents by identifying actual and potential causes of incidents, and managing workarounds and known errors\". Ref 5.2.8"
      },
      {
        "number": 4,
        "prompt": "What is the PRIMARY use of a change schedule?",
        "choices": {
          "A": "To support 'incident management' and improvement planning",
          "B": "To manage emergency changes",
          "C": "To plan changes and help avoid conflicts",
          "D": "To manage standard changes"
        },
        "answer": "C",
        "syllabusRef": "7.1.b",
        "rationale": "A. Incorrect. While it can be used after deploying a change, this is not the main use of the change schedule. \"The change schedule is used to help plan changes, assist in communication, avoid conflicts, and assign resources. It can also be used after changes have been deployed to provide information needed for incident management, problem management, and improvement planning.\" Ref 5.2.4 B. Incorrect. \"Emergency changes: These are changes that must be implemented as soon as possible; for example, to resolve an incident or implement a security patch. Emergency changes are not typically included in a change schedule, and the process for assessment and authorization is expedited to ensure they can be implemented quickly.\" Ref 5.2.4 C. Correct. \"The change schedule is used to help plan changes, assist in communication, avoid conflicts, and assign resources.\" Ref 5.2.4 D. Incorrect. Standard changes are already pre-authorized and do not need to be included on a change schedule. \"These are low-risk, pre-authorized changes that are well understood and fully documented, and can be implemented without needing additional authorization.\" Ref 5.2.4"
      },
      {
        "number": 5,
        "prompt": "Which service management dimension is focused on activities and how these are coordinated?",
        "choices": {
          "A": "Organizations and people",
          "B": "Information and technology",
          "C": "Partners and suppliers",
          "D": "Value streams and processes"
        },
        "answer": "D",
        "syllabusRef": "3.1.d",
        "rationale": "A. Incorrect. The ‘organizations and people’ dimension describes “roles and responsibilities, formal organizational structures, culture, and required staffing and competencies.” Ref 3.1 B. Incorrect. The ‘information and technology’ dimension includes “the information and knowledge necessary for the management of services, as well as the technologies required” and “the information created, managed, and used in the course of service provision and consumption, and the technologies that support and enable that service.” Ref 3.2 C. Incorrect. “The partners and suppliers dimension encompasses an organization’s relationships with other organizations that are involved in the design, development, deployment, delivery, support and/or continual improvement of services. It also incorporates contracts and other agreements between the organization and its partners or suppliers”. Ref 3.3 D. Correct. The ‘value streams and processes’ dimension “focuses on what activities the organization undertakes and how they are organized, as well as how the organization ensures that it is enabling value creation for all stakeholders efficiently and effectively.” Ref 3.4"
      },
      {
        "number": 6,
        "prompt": "How does categorization of incidents assist the ‘incident management’ practice?",
        "choices": {
          "A": "It helps direct the incident to the correct support area",
          "B": "It determines the priority assigned to the incident",
          "C": "It ensures that incidents are resolved in timescales agreed with the customer",
          "D": "It determines how the service provider is perceived"
        },
        "answer": "A",
        "syllabusRef": "7.1.c",
        "rationale": "A. Correct. “More complex incidents will usually be escalated to a support team for resolution. Typically, the routing is based on the incident category, which should help to identify the correct team.” Ref 5.2.5 B. Incorrect. The category is concerned with the type of incident whereas priority is determined by business impact. “Incidents are prioritized based on agreed classification to ensure that incidents with the highest business impact are resolved first.” Ref 5.2.5 C. Incorrect. “Every incident should be logged and managed to ensure that it is resolved in a time that meets the expectations of the customer and user.” Categorization by itself will not ensure this. Ref 5.2.5 D. Incorrect. Customer and user satisfaction determines how the service provider is perceived. “Incident management can have an enormous impact on customer and user satisfaction, and on how customers and users perceive the service provider.” Ref 5.2.5"
      },
      {
        "number": 7,
        "prompt": "Identify the missing word(s) in the following sentence. A service is a means of enabling value co-creation by facilitating [?] that customers want to achieve.",
        "choices": {
          "A": "the warranty",
          "B": "outcomes",
          "C": "the utility",
          "D": "outputs"
        },
        "answer": "B",
        "syllabusRef": "1.1.a",
        "rationale": "A. Incorrect. Warranty is “assurance that a product or service will meet agreed requirements.” Warranty of a service is necessary, but not sufficient to enable value co-creation. Ref 2.5.4 B. Correct. A service is “a means of enabling value co-creation by facilitating outcomes that customers want to achieve, without the customer having to manage specific costs and risks”. Ref 2.3.1 C. Incorrect. Utility is “the functionality offered by a product or service”. Utility of a service is necessary, but not sufficient to enable value co-creation. Ref 2.5.4 D. Incorrect. An output is “a tangible or intangible deliverable of an activity.” The output of a service is necessary, but not sufficient to enable value co-creation. Ref 2.5.1"
      },
      {
        "number": 8,
        "prompt": "Which is a recommendation of the ‘continual improvement’ practice?",
        "choices": {
          "A": "There should at least be a small team dedicated to leading ‘continual improvement’ efforts",
          "B": "All improvements should be managed as multi-phase projects",
          "C": "‘Continual improvement' should be isolated from other practices",
          "D": "External suppliers should be excluded from improvement initiatives"
        },
        "answer": "A",
        "syllabusRef": "7.1.a",
        "rationale": "A. Correct. “Although everyone should contribute in some way, there should at least be a small team dedicated full-time to leading continual improvement efforts and advocating the practice across the organization.” Ref 5.1.2 B. Incorrect. “Different types of improvements may call for different improvement methods. For example, some improvements may be best organized into a multi- phase project, while others may be more appropriate as a single quick effort.” Ref 5.1.2 C. Incorrect. “The continual improvement practice is integral to the development and maintenance of every other practice.” Ref 5.1.2 D. Incorrect. “When third-party suppliers form part of the service landscape, they should also be part of the improvement effort.” Ref 5.1.2"
      },
      {
        "number": 9,
        "prompt": "Which is a potential benefit of using an IT service management tool to support the 'incident management' practice?",
        "choices": {
          "A": "It may ensure that the cause of incidents is identified within agreed times",
          "B": "It may provide automated matching of incidents to problems or known errors",
          "C": "It may ensure that supplier contracts are aligned with the needs of the service provider",
          "D": "It may provide automated resolution and closure of complex incidents"
        },
        "answer": "B",
        "syllabusRef": "7.1.c",
        "rationale": "A. Incorrect. “Target resolution times are agreed, documented, and communicated to ensure that expectations are realistic.” A good IT service management tool may help the organization to meet these times, but the tool cannot ensure that this happens. Furthermore, identifying the causes of incidents is a 'problem management' activity Ref 5.2.5 B. Correct. “Modern IT service management tools can provide automated matching of incidents to other incidents, problems or known errors”. Ref 5.2.5 C. Incorrect. ‘Incident management’ requires supplier contracts to be correctly aligned, but ensuring that the contracts are aligned is a purpose of the ‘supplier management’ practice. Ref 5.1.13 D. Incorrect. “The most complex incidents, and all major incidents, often require a temporary team to work together to identify the resolution”. “Investigation of more complicated incidents often requires knowledge and expertise, rather than procedural steps.” Ref 5.2.5"
      },
      {
        "number": 10,
        "prompt": "Which role submits service requests?",
        "choices": {
          "A": "The user, or their authorized representative",
          "B": "The customer, or their authorized representative",
          "C": "The sponsor, or their authorized representative",
          "D": "The supplier, or their authorized representative"
        },
        "answer": "A",
        "syllabusRef": "7.1.e",
        "rationale": "A. Correct. “The purpose of the service request management practice is to support the agreed quality of a service by handling all pre-defined, user-initiated service requests...” and a service request is defined as “a request from a user or a user’s authorized representative that initiates a service action”. Ref 5.2.16 B. Incorrect. A customer is “the role that defines the requirements for a service and takes responsibility for the outcomes of service consumption”. A customer could also be a user, and in that role they may submit a service request. Ref 2.2.2 C. Incorrect. A sponsor is “the role that authorizes budget for service consumption.” A sponsor could also be a user, and in that role they may submit a service request. Ref 2.2.2 D. Incorrect. “The partners and suppliers dimension encompasses an organization’s relationships with other organizations that are involved in the design, development, deployment, delivery, support, and/or continual improvement of services.”. This does not include consumption of services, and “The purpose of the service request management practice is to support the agreed quality of a service by handling all pre-defined, user-initiated service requests.” Ref 3.3, 5.2.16"
      },
      {
        "number": 11,
        "prompt": "Which practice provides a single point of contact for users?",
        "choices": {
          "A": "Incident management",
          "B": "Change enablement",
          "C": "Service desk",
          "D": "Service request management"
        },
        "answer": "C",
        "syllabusRef": "7.1.f",
        "rationale": "A. Incorrect. “The purpose of the incident management practice is to minimize the negative impact of incidents by restoring normal service operation as quic kly as possible.” The ‘incident management’ practice does not provide a single point of contact for service users. Ref 5.2.5 B. Incorrect. “The purpose of the change enablement practice is to maximize the number of successful service and product changes by ensuring that risks have been properly assessed, authorizing changes to proceed, and managing the change schedule.” The ‘change enablement’ practice does not provide a single point of contact for service users. Ref 5.2.4 C. Correct. “The purpose of the service desk practice is to capture demand for incident resolution and service requests. It should also be the entry point and single point of contact for the service provider with all of its users.” Ref 5.2.14 D. Incorrect. “The purpose of the service request management practice is to support the agreed quality of a service by handling all pre-defined, user-initiated service requests in an effective and user-friendly manner.” The ‘service request management’ practice does not provide a single point of contact for service users. Ref 5.2.16"
      },
      {
        "number": 12,
        "prompt": "Which guiding principle recommends that the four dimensions of service management are considered?",
        "choices": {
          "A": "Think and work holistically",
          "B": "Progress iteratively with feedback",
          "C": "Focus on value",
          "D": "Keep it simple and practical"
        },
        "answer": "A",
        "syllabusRef": "2.2.e",
        "rationale": "A. Correct. The ‘think and work holistically’ guiding principle advises that all aspects of an organization are considered when providing value in the form of services. This includes all four dimensions of service management (organizations and people; information and technology; partners and suppliers; value streams and processes). “Services are delivered to internal and external service consumers through the coordination and integration of the four dimensions of service management.” Ref 4.3.5 B. Incorrect. The ‘progress iteratively with feedback’ guiding principle is concerned with breaking initiatives into manageable sections that can be executed more easily. It is not primarily concerned with addressing the four dimensions of service management. Ref 4.3.3 C. Incorrect. The ‘focus on value’ guiding principle ensures that everything that the organization does links back to providing value to service consumers. It is not primarily concerned with addressing the four dimensions of service management. Ref 4.3.1 D. Incorrect. The ‘keep it simple and practical’ guiding principle focuses on keeping things simple by reducing complexity and eliminating unnecessary activities and steps. It is not primarily concerned with addressing the four dimensions of service management. Ref 4.3.6"
      },
      {
        "number": 13,
        "prompt": "Which would be supported by the ‘service request management’ practice?",
        "choices": {
          "A": "A request to authorize a change that could have an effect on a service",
          "B": "A request from a user for something which is a normal part of service delivery",
          "C": "A request to restore service after a service interruption",
          "D": "A request to investigate the cause of multiple related incidents"
        },
        "answer": "B",
        "syllabusRef": "7.1.e",
        "rationale": "A. Incorrect. This would be supported by the ‘change enablement’ practice. A change is “the addition, modification, or removal of anything that could have a direct or indirect effect on services.” Normal changes “need to be scheduled, assessed, and authorized”. Ref 5.2.4 B. Correct. A service request is “a request from a user or a user’s authorized representative that initiates a service action which has been agreed as a normal part of service delivery.” Ref 5.2.16 C. Incorrect. This would be supported by the ‘incident management’ practice. An incident is “an unplanned interruption to a service or reduction in the quality of a service.” Ref 5.2.5 D. Incorrect. This would be supported by the ‘problem management’ practice. A problem is “a cause, or potential cause, of one or more incidents”. Ref 5.2.8"
      },
      {
        "number": 14,
        "prompt": "Which practice is the responsibility of everyone in the organization?",
        "choices": {
          "A": "Service level management",
          "B": "Change enablement",
          "C": "Problem management",
          "D": "Continual improvement"
        },
        "answer": "D",
        "syllabusRef": "7.1.a",
        "rationale": "A. Incorrect. The ‘service level management’ practice is not the responsibility of everyone in the organization. A number of roles are required but there is no fixed structure. It is recommended that there is an independent and non-aligned role where possible. Ref 5.2.15 B. Incorrect. The ‘change enablement’ practice is not the responsibility of everyone in the organization. Many roles can be assigned to change enablement such as change authority. It also requires input from people with specialist knowledge. Ref 5.2.4 C. Incorrect. The ‘problem management’ practice is not the responsibility of everyone in the organization. Most problem management activity relies on the knowledge and experience of staff. Ref 5.2.8 D. Correct. “continual improvement is everyone’s responsibility” and “The commitment to and practice of continual improvement must be embedded into every fibre of the organization”. Ref 5.1.2"
      },
      {
        "number": 15,
        "prompt": "Identify the missing word in the following sentence. The purpose of the ‘information security management’ practice is to [?] the organization’s information.",
        "choices": {
          "A": "store",
          "B": "provide",
          "C": "audit",
          "D": "protect"
        },
        "answer": "D",
        "syllabusRef": "6.1.a",
        "rationale": "A. Incorrect. “The purpose of the information security management practice is to protect the information needed by the organization to conduct its business. This includes understanding and managing risks to the confidentiality, integrity, and availability of information, as well as other aspects of information security such as authentication (ensuring someone is who they claim to be) and non-repudiation (ensuring that someone can’t deny that they took an action).” Ref 5.1.3 B. Incorrect. “The purpose of the information security management practice is to protect the information needed by the organization to conduct its business. This includes understanding and managing risks to the confidentiality, integrity and availability of information, as well as other aspects of information security such as authentication (ensuring someone is who they claim to be) and non-repudiation (ensuring that someone can’t deny that they took an action).” Ref 5.1.3 C. Incorrect. “The purpose of the information security management practice is to protect the information needed by the organization to conduct its business. This includes understanding and managing risks to the confidentiality, integrity and availability of information, as well as other aspects of information security such as authentication (ensuring someone is who they claim to be) and non-repudiation (ensuring that someone can’t deny that they took an action).” Ref 5.1.3 D. Correct. “The purpose of the information security management practice is to protect the information needed by the organization to conduct its business. This includes understanding and managing risks to the confidentiality, integrity and availability of information, as well as other aspects of information security such as authentication (ensuring someone is who they claim to be) and non-repudiation (ensuring that someone can’t deny that they took an action).” Ref 5.1.3"
      },
      {
        "number": 16,
        "prompt": "Which guiding principle recommends collecting data before deciding what can be re-used?",
        "choices": {
          "A": "Focus on value",
          "B": "Start where you are",
          "C": "Keep it simple and practical",
          "D": "Progress iteratively with feedback"
        },
        "answer": "B",
        "syllabusRef": "2.2.b",
        "rationale": "A. Incorrect. The 'focus on value' guiding principle states that \"All activities conducted by the organization should link back, directly or indirectly, to value for itself, its customers, and other stakeholders.\" Ref 4.3.1 B. Correct. The 'start where you are' guiding principle recommends that \"Services and methods already in place should be measured and/or observed directly to properly understand their current state and what can be reused from them... Getting data from the source helps to avoid assumptions which, if proven to be unfounded, can be disastrous to timelines, budgets and the quality of results.\" Ref 4.3.2 C. Incorrect. The 'keep it simple and practical' guiding principle states that an organization should \"Always use the minimum number of steps needed to accomplish an objective.\" Ref 4.3.6 D. Incorrect. The 'progress iteratively with feedback principle states that \"By organizing work into smaller, manageable sections that can be executed and completed in a timely manner, the focus on each effort will be sharper and easier to maintain.\" Ref 4.3.3"
      },
      {
        "number": 17,
        "prompt": "Which is NOT usually included as part of incident management?",
        "choices": {
          "A": "Scripts for collecting initial information about incidents",
          "B": "Formalized procedures for logging incidents",
          "C": "Detailed procedures for the diagnosis of incidents",
          "D": "The use of specialized knowledge for complicated incidents"
        },
        "answer": "C",
        "syllabusRef": "7.1.c",
        "rationale": "A. Incorrect. “There may be scripts for collecting information from users during initial contact”. Ref 5.2.5 B. Incorrect. “There should be a formal process for logging and managing incidents.” Ref 5.2.5 C. Correct. “This process does NOT usually include detailed procedures for how to diagnose, investigate, and resolve incidents.” Ref 5.2.5 D. Incorrect. “Investigation of more complicated incidents often requires knowledge and expertise, rather than procedural steps.” Ref 5.2.5"
      },
      {
        "number": 18,
        "prompt": "Which describes the nature of the guiding principles?",
        "choices": {
          "A": "Guiding principles can guide an organization in all circumstances",
          "B": "Each guiding principle mandates specific actions and decisions",
          "C": "An organization will select and adopt only one of the seven guiding principles",
          "D": "Guiding principles describe the processes that all organizations must adopt"
        },
        "answer": "A",
        "syllabusRef": "2.1",
        "rationale": "A. Correct. A guiding principle is defined as a recommendation that can guide an organization in all circumstances and will guide organizations when adopting service management. They are not described as prescriptive or mandatory. Ref 4.3 B. Incorrect. The guiding principles will be reviewed and adopted by organizations. The guiding principles guide organizations to make decisions and adopt actions. They do not mandate specific actions and decisions. Ref 4.3.8 C. Incorrect. Organizations will use the principles relevant to them and are not mandated to use a given number. Ref 4.3 D. Incorrect. The guiding principles guide organizations to make decisions and adopt actions. They are not mandatory. Ref 4.3"
      },
      {
        "number": 19,
        "prompt": "Which statement about a change authority is CORRECT?",
        "choices": {
          "A": "A single change authority should be assigned to authorize all types of change and change models",
          "B": "A change authority should be assigned for each type of change and change model",
          "C": "Normal changes are pre-authorized and do not need a change authority",
          "D": "Emergency changes can be implemented without authorization from a change authority"
        },
        "answer": "B",
        "syllabusRef": "7.1.b",
        "rationale": "A. Incorrect. “It is essential that the correct change authority is assigned to each type of change to ensure that change enablement is both efficient and effective.” For normal changes, “change models based on the type of change determ ine the roles for assessment and authorization”. A single change authority is inadequate. Ref 5.2.4 B. Correct. “It is essential that the correct change authority is assigned to each type of change to ensure that change enablement is both efficient and effective.” For normal changes, “change models based on the type of change determine the roles for assessment and authorization”. Ref 5.2.4 C. Incorrect. Normal changes are “changes that need to be scheduled, assessed, and authorized following a process.” Thus, all normal changes will be authorized by a change authority. Standard changes can be pre-authorized: “These are low-risk, pre-authorized changes that are well understood and fully documented, and can be implemented without needing additional authorization”. Ref 5.2.4 D. Incorrect. “Emergency changes are not typically included in a change schedule, and the process for assessment and authorization is expedited to ensure they can be implemented quickly.” Therefore, all emergency changes will be authorized b y a change authority. Ref 5.2.4"
      },
      {
        "number": 20,
        "prompt": "Which practice has the purpose of making new and changed services and features available for use?",
        "choices": {
          "A": "Change enablement",
          "B": "Service request management",
          "C": "Release management",
          "D": "Deployment management"
        },
        "answer": "C",
        "syllabusRef": "6.1.f",
        "rationale": "A. Incorrect. “The purpose of the change enablement practice is to maximize the number of successful service and product changes by ensuring that risks have been properly assessed, authorizing changes to proceed, and managing the change schedule.” Ref 5.2.4 B. Incorrect. “The purpose of the service request management practice is to support the agreed quality of a service by handling all pre-defined, user-initiated service requests in an effective and user-friendly manner”. Ref 5.2.16 C. Correct. “The purpose of the release management practice is to make new and changed services and features available for use”. Ref 5.2.9 D. Incorrect. “The purpose of the deployment management practice is to move new or changed hardware, software, documentation, processes, or any other component to live environments.” Ref 5.3.1"
      },
      {
        "number": 21,
        "prompt": "Which value chain activity ensures people understand the organization’s vision?",
        "choices": {
          "A": "Improve",
          "B": "Plan",
          "C": "Deliver and support",
          "D": "Obtain/build"
        },
        "answer": "B",
        "syllabusRef": "5.2.a",
        "rationale": "A. Incorrect. The purpose of the ‘improve’ value chain activity is “to ensure continual improvement of products, services, and practices across all value chain activities and the four dimensions of service management.” Ref 4.5.2 B. Correct. The purpose of the ‘plan’ value chain activity is “to ensure a shared understanding of the vision, current status, and improvement direction for all four dimensions and all products and services across the organization.” Ref 4.5.1 C. Incorrect. The purpose of the ‘deliver and support’ value chain activity is “to ensure that services are delivered and supported according to agreed specifications and stakeholders’ expectations.” Ref 4.5.6 D. Incorrect. The purpose of the ‘obtain/build’ value chain activity is “to ensure that service components are available when and where they are needed, and meet agreed specifications.” Ref 4.5.5"
      },
      {
        "number": 22,
        "prompt": "Which statement about the value chain activities is CORRECT?",
        "choices": {
          "A": "Every practice belongs to a specific value chain activity",
          "B": "A specific combination of value chain activities and practices forms a service relationship",
          "C": "Service value chain activities form a single workflow that enables value creation",
          "D": "Each value chain activity contributes to the value chain by transforming specific inputs into outputs"
        },
        "answer": "D",
        "syllabusRef": "5.1",
        "rationale": "A. Incorrect. “Value chain activities use different combinations of ITIL practices”. No practice belongs to a single value chain activity. Ref 4.5 B. Incorrect. Service value streams are “specific combinations of activities and practices, and each one is designed for a particular scenario” and “Service relationships include service provision, service consumption, and service relationship management.” Ref 4.5, 2.4.1 C. Incorrect. Service value streams are “specific combinations of activities and practices, and each one is designed for a particular scenario.” There can be multiple service value streams within one service value chain. Ref 4.5 D. Correct. “These activities represent the steps an organization takes in the creation of value. Each activity transforms inputs into outputs. These inputs can be demand from outside the value chain or outputs of other activities. All the activities are interconnected, with each activity receiving and providing triggers for further action.” Ref 4.5"
      },
      {
        "number": 23,
        "prompt": "What is the purpose of the ‘supplier management’ practice?",
        "choices": {
          "A": "To ensure that the organization‘s suppliers and their performance are managed appropriately to support the seamless provision of quality products and services",
          "B": "To align the organization's practices and services with changing business needs through the ongoing identification and improvement of services",
          "C": "To ensure that the organization’s suppliers and their performance are managed appropriately at strategic and tactical levels through coordinated marketing, selling, and delivery activities",
          "D": "To ensure that accurate and reliable information about the configuration of suppliers' services is available when and where it is needed"
        },
        "answer": "A",
        "syllabusRef": "6.1.c",
        "rationale": "A. Correct. “The purpose of the supplier management practice is to ensure that the organization’s suppliers and their performance are managed appropriately to support the seamless provision of quality products and services”. Ref 5.1.13 B. Incorrect. “The purpose of the continual improvement practice is to align the organization’s practices and services with changing business needs through the ongoing improvement of products, services, and practices, or any element involved in the management of products and services.” This is not the purpose of the ‘supplier management’ practice. An organization is unlikely to change its practices to suit a supplier’s needs. Ref 5.1.2 C. Incorrect. “The purpose of the relationship management practice is to establish and nurture the links between the organization and its stakeholders at strategic and tactical levels”. This is not the purpose of the ‘supplier management’ practice. Ref 5.1.9 D. Incorrect. “The purpose of the service configuration management practice is to ensure that accurate and reliable information about the configuration of services, and the CIs that support them, is available when and where it is needed”. This is not the purpose of the ‘supplier management’ practice. Ref 5.2.11"
      },
      {
        "number": 24,
        "prompt": "What are the two types of cost that a service consumer should evaluate?",
        "choices": {
          "A": "The price of the service, and the cost of creating the service",
          "B": "The costs removed by the service, and the costs imposed by the service",
          "C": "The cost of provisioning the service, and the cost of improving the service",
          "D": "The cost of software, and the cost of hardware"
        },
        "answer": "B",
        "syllabusRef": "1.2.a",
        "rationale": "A. Incorrect. The price of the service is only part of the costs imposed on the consumer. The cost of creating the service is a concern of the service provider, not the service consumer. The service consumer should also evaluate the costs removed from the consumer. Ref 2.5.2 B. Correct. From the service consumer’s perspective, there are two types of costs involved in service relationships: 1. Costs removed from the service consumer by the service (a part of the value proposition). This may include costs of staff, technology, and other resources which are not needed by the consumer. 2. Costs imposed on the consumer by the service (the costs of service consumption). The total cost of consuming a service includes the price charged by the service provider (if any), plus other costs such as staff training, costs of network utilization, procurement, etc. Ref 2.5.2 C. Incorrect. The cost of provisioning the service, and the cost of improving the service are concerns of the service provider, not the service consumer. The service consumer should evaluate the costs removed from the consumer and the costs imposed on the consumer. Ref 2.5.2 D. Incorrect. The two types of cost that a service consumer should evaluate are costs removed from the consumer and costs imposed on consumers. The cost of hardware and software may be included in either of these, but will only be part of that cost. Ref 2.5.2"
      },
      {
        "number": 25,
        "prompt": "Which is a purpose of the ‘service desk’ practice?",
        "choices": {
          "A": "To reduce the likelihood and impact of incidents by identifying actual and potential causes of incidents",
          "B": "To maximize the number of successful IT changes by ensuring risks are properly assessed",
          "C": "To capture demand for incident resolution and service requests",
          "D": "To set clear business-based targets for service performance"
        },
        "answer": "C",
        "syllabusRef": "6.1.n",
        "rationale": "A. Incorrect. “The purpose of the problem management practice is to reduce the likelihood and impact of incidents by identifying actual and potential causes of incidents, and managing workarounds and known errors.” Ref 5.2.8 B. Incorrect. “The purpose of the change enablement practice is to maximize the number of successful service and product changes by ensuring that risks have been properly assessed, authorizing changes to proceed, and managing the change schedule.” Ref 5.2.4 C. Correct. “The purpose of the service desk practice is to capture demand for incident resolution and service requests. It should also be the entry point and single point of contact for the service provider with all of its users.” Ref 5.2.14 D. Incorrect. “The purpose of the service level management practice is to set clear business-based targets for service performance, so that the delivery of a service can be properly assessed, monitored, and managed against these targets.” Ref 5.2.15"
      },
      {
        "number": 26,
        "prompt": "How should an organization adopt continual improvement methods?",
        "choices": {
          "A": "Use a new method for each improvement the organization handles",
          "B": "Select a few key methods for the types of improvement that the organization handles",
          "C": "Build the capability to use as many improvement methods as possible",
          "D": "Select a single method for all improvements that the organization handles"
        },
        "answer": "B",
        "syllabusRef": "7.1.a",
        "rationale": "A. Incorrect. The guidance describes how there are many methods that can be used for improvement initiatives and warns against using too many. It further states that “Different types of improvement may call for different improvement methods”. Therefore, using a new method each time is inappropriate. Ref 5.1.2 B. Correct. The guidance describes how there are many methods that can be used for improvement initiatives and warns against using too many. The guidance states “It is a good idea to select a few key methods that are appropriate to the types of improvement the organization typically handles and to cultivate those methods”. Ref 5.1.2 C. Incorrect. The guidance describes how there are many methods that can used for improvement initiatives and warns against using too many. Ref 5.1.2 D. Incorrect. The guidance describes how there are many methods that can be used for improvement initiatives and warns against using too many. It further states that “Different types of improvements may call for different improvement methods”. Therefore, selecting a single method is inappropriate. Ref 5.1.2"
      },
      {
        "number": 27,
        "prompt": "Which ITIL concept describes governance?",
        "choices": {
          "A": "The seven guiding principles",
          "B": "The four dimensions of service management",
          "C": "The service value chain",
          "D": "The service value system"
        },
        "answer": "D",
        "syllabusRef": "4.1",
        "rationale": "A. Incorrect. The seven guiding principles are ‘focus on value’, ‘start where you are’, ‘progress iteratively with feedback’, ‘collaborate and promote visibility’, ‘think and work holistically’, ‘keep it simple and practical’ and ‘optimize and automate’. Ref 4.3 B. Incorrect. The four dimensions of service management are ‘organizations and people’, ‘information and technology’, ‘partners and suppliers’, and ‘value streams and processes’. Ref 3.1-3.4 C. Incorrect. The activities of the service value chain are ‘plan’, ‘improve’, ‘engage’, ‘design and transition’, ‘obtain/build’, and ‘deliver and support’. Ref 4.5 D. Correct. The components of the service value system are ‘guiding principles’, ‘governance’, ‘service value chain’, ‘practices’, and ‘continual improvement’. Ref 4.1"
      },
      {
        "number": 28,
        "prompt": "Which is a recommendation of the ‘service desk’ practice?",
        "choices": {
          "A": "Service desks should avoid the use of automation",
          "B": "Service desks should be highly technical",
          "C": "Service desks should understand the wider organization",
          "D": "Service desks should be a physical team in a single fixed location"
        },
        "answer": "C",
        "syllabusRef": "7.1.f",
        "rationale": "A. Incorrect. “With increased automation, AI, robotic process automation (RPA), and chatbots, service desks are moving to provide more self-service logging and resolution directly via online portals and mobile applications.” Ref 5.2.14 B. Incorrect. “The service desk may not need to be highly technical, although some are.” Ref 5.2.14 C. Correct. “Another key aspect of a good service desk is its practical understanding of the wider organization, the business processes, and the users.” Ref 5.2.14 D. Incorrect. “In some cases, the service desk is a tangible team, working in a single location... In other cases, a virtual service desk allows agents to work from multiple locations, geographically dispersed.” Ref 5.2.14"
      },
      {
        "number": 29,
        "prompt": "Which guiding principle recommends organizing work into smaller, manageable sections that can be executed and completed in a timely manner?",
        "choices": {
          "A": "Focus on value",
          "B": "Start where you are",
          "C": "Progress iteratively with feedback",
          "D": "Collaborate and promote visibility"
        },
        "answer": "C",
        "syllabusRef": "2.2.c",
        "rationale": "A. Incorrect. The ‘Focus on value’ guiding principle helps to ensure that you consider all aspects of value for the service consumer, as well as the service provider and other stakeholders. It does not specifically describe organizing work into smaller, manageable sections that can be executed and completed in a timely manner. Ref 4.3.1 B. Incorrect. The ‘Start where you are’ guiding principle helps to avoid waste and leverage existing services, processes, people, tools, etc. It does not specifically describe organizing work into smaller, manageable sections that can be executed and completed in a timely manner. Ref 4.3.2 C. Correct. The description of the ‘progress iteratively with feedback’ guiding principle says “by organizing work into smaller, manageable sections that can be executed and completed in a timely manner, the focus on each effort will be sharper and easier to maintain.” Ref 4.3.3 D. Incorrect. The ‘collaborate and promote visibility’ guiding principle helps to involve the right people and provide better decision-making and greater likelihood of success. It does not specifically describe organizing work into smaller, manageable sections that can be executed and completed in a timely manner. Ref 4.3.4"
      },
      {
        "number": 30,
        "prompt": "What is a standard change?",
        "choices": {
          "A": "A change that is well understood, fully documented and pre-authorized",
          "B": "A change that needs to be assessed, authorized, and scheduled by a change authority",
          "C": "A change that doesn’t need a risk assessment because it is required to resolve an incident",
          "D": "A change that is assessed, authorized, and scheduled as part of ‘continual improvement’"
        },
        "answer": "A",
        "syllabusRef": "7.1.b",
        "rationale": "A. Correct. “These are low-risk, pre-authorized changes that are well understood and fully documented, and can be implemented without needing additional authorization. They are often initiated as service requests, but may also be operational changes. When the procedure for a standard change is created or modified, there should be a full risk assessment and authorization as for any other change. This risk assessment does not need to be repeated each time the standard change is implemented; it only needs to be done if there is a modification to the way it is carried out.” Ref 5.2.4 B. Incorrect. Normal changes are “changes that need to be scheduled, assessed, and authorized.” Ref 5.2.4 C. Incorrect. An emergency change that is needed to resolve an incident should still be assessed and authorized. “As far as possible, emergency changes should be subject to the same testing, assessment, and authorization as normal changes”. Ref 5.2.4 D. Incorrect. This is a description of a normal change: “changes that need to be scheduled, assessed, and authorized”. Ref 5.2.4"
      },
      {
        "number": 31,
        "prompt": "What happens if a workaround becomes the permanent way of dealing with a problem that cannot be resolved cost-effectively?",
        "choices": {
          "A": "A change request is submitted to change enablement",
          "B": "Problem management restores the service as soon as possible",
          "C": "The problem remains in the known error status",
          "D": "The problem record is deleted"
        },
        "answer": "C",
        "syllabusRef": "7.1.d",
        "rationale": "A. Incorrect. A change request is only raised if it is justified. “Error control also includes identification of potential permanent solutions which may result in a change request for implementation of a solution, but only if this can be justified in terms of cost, risks, and benefits”. Ref 5.2.8 B. Incorrect. The ‘incident management’ practice restores service not the ‘pro blem management’ practice. “The purpose of the incident management practice is to minimize the negative impact of incidents by restoring normal service operation as quickly as possible.”. Ref 5.2.5 C. Correct. “An effective incident workaround can become a permanent way of dealing with some problems when resolving the problem is not viable or cost - effective. In this case, the problem remains in the known error status, and the documented workaround is applied should related incidents occur”. Ref 5.2.8 D. Incorrect. The problem record is not deleted. “Workarounds are documented in problem records”. “.. the problem remains in the known error status, and the documented workaround is applied should related incidents occur”. Ref 5.2.8"
      },
      {
        "number": 32,
        "prompt": "What is the definition of change?",
        "choices": {
          "A": "To add, modify or remove anything that could have a direct or indirect effect on services",
          "B": "To ensure that accurate and reliable information about the configuration of services is available",
          "C": "To make new and changed services and features available for use",
          "D": "To move new or changed hardware, software, or any other component to live environments"
        },
        "answer": "A",
        "syllabusRef": "6.2.d",
        "rationale": "A. Correct. A change is the “addition, modification, or removal of anything that could have a direct or indirect effect on services”. Ref 5.2.4 B. Incorrect. “The purpose of the service configuration management practice is to ensure that accurate and reliable information about the configuration of services, and the CIs that support them, is available when and where it is needed.” Ref 5.2.11 C. Incorrect. “The purpose of the release management practice is to make new and changed services and features available for use”. Ref 5.2.9 D. Incorrect. “The purpose of the deployment management practice is to move new or changed hardware, software, documentation, processes, or any other component to live environments.” Ref 5.3.1"
      },
      {
        "number": 33,
        "prompt": "What is the definition of an event?",
        "choices": {
          "A": "Any change of state that has significance for the management of a service or other configuration item",
          "B": "Any component that needs to be managed in order to deliver an IT service",
          "C": "An unplanned interruption to a service or reduction in the quality of a service",
          "D": "Any financially valuable component that can contribute to the delivery of an IT product or service"
        },
        "answer": "A",
        "syllabusRef": "6.2.b",
        "rationale": "A. Correct. “An event can be defined as any change of state that has significance for the management of a service or other configuration item (CI)”. Ref 5.2.7 B. Incorrect. The definition of a configuration item is “any component that needs to be managed in order to deliver an IT service.” Ref 5.2.11 C. Incorrect. An incident is “An unplanned interruption to a service or reduction in the quality of a service.” Ref 5.2.5 D. Incorrect. An IT asset is “Any financially valuable component that can contribute to the delivery of an IT product or service.” Ref 5.2.11"
      },
      {
        "number": 34,
        "prompt": "Which describes outcomes?",
        "choices": {
          "A": "Tangible or intangible deliverables",
          "B": "Functionality offered by a product or service",
          "C": "Results desired by a stakeholder",
          "D": "Configuration of an organization’s resources"
        },
        "answer": "C",
        "syllabusRef": "1.2.d",
        "rationale": "A. Incorrect. “A tangible or intangible deliverable of an activity” is the definition of an output, not an outcome. Ref 2.5.1 B. Incorrect. “The functionality offered by a product or service to meet a particular need” is the definition of utility, not an outcome. The utility of the service may facilitate outcomes. Ref 2.5.4 C. Correct. An outcome is “a result for a stakeholder enabled by one or more outputs”. The definition of a service describes how the value of a service ena bles value co-creation by facilitating outcomes that customers want to achieve. Ref 2.5.1 D. Incorrect. A product is “a configuration of an organization’s resources designed to offer value for a consumer.” Ref 2.3.1"
      },
      {
        "number": 35,
        "prompt": "Which is NOT a key focus of the ‘information and technology’ dimension?",
        "choices": {
          "A": "Security and compliance",
          "B": "Communication systems and knowledge bases",
          "C": "Workflow management and inventory systems",
          "D": "Roles and responsibilities"
        },
        "answer": "D",
        "syllabusRef": "3.1.b",
        "rationale": "A. Incorrect. “The challenges of information management, such as those presented by security and regulatory compliance requirements, are also a focus of [the ‘information and technology] dimension”. Ref 3.2 B. Incorrect. “The technologies that support service management include, but are not limited to, workflow management systems, knowledge bases, inventory systems, communication systems, and analytical tools”. Ref 3.2 C. Incorrect. “The technologies that support service management include, but are not limited to, workflow management systems, knowledge bases, inventory systems, communication systems, and analytical tools.” Ref 3.2 D. Correct. “The organizations and people dimension of a service covers roles and responsibilities, formal organizational structures, culture, and required staffing and competencies, all of which are related to the creation, delivery, and improvement of a service.” Ref 3.1"
      },
      {
        "number": 36,
        "prompt": "Which practices are typically involved in the implementation of a problem resolution? 1. Continual improvement 2. Service request management 3. Service level management 4. Change enablement",
        "choices": {
          "A": "1 and 2",
          "B": "2 and 3",
          "C": "3 and 4",
          "D": "1 and 4"
        },
        "answer": "D",
        "syllabusRef": "7.1.d",
        "rationale": "D. Correct. (1) “Problem management activities can identify improvement opportunities in all four dimensions of service management. Solutions can in some cases be treated as improvement opportunities, so they are included in a continual improvement register (CIR), and continual improvement techniques are used to prioritize and manage them.” (4) “Error control also includes identification of potential permanent solutions which may result in a change request for implementation of a solution.” Ref 5.2.8 A, B C. Incorrect. (2) “The purpose of the service request management practice is to support the agreed quality of a service by handling all pre-defined, user-initiated service requests in an effective and user-friendly manner.” Ref 5.2.16 (3) “The purpose of the service level management practice is to set clear business- based targets for service levels, and to ensure that delivery of services is properly assessed, monitored, and managed against these targets.” Ref 5.2.15"
      },
      {
        "number": 37,
        "prompt": "Which is a key consideration for the guiding principle ‘keep it simple and practical’?",
        "choices": {
          "A": "Try to create a solution for every exception",
          "B": "Understand how each element contributes to value creation",
          "C": "Ignore the conflicting objectives of different stakeholders",
          "D": "Start with a complex solution, then simplify"
        },
        "answer": "B",
        "syllabusRef": "2.2.f",
        "rationale": "A. Incorrect. “Trying to provide a solution for every exception will often lead to over- complication. When creating a process or a service, designers need to think about exceptions, but they cannot cover them all. Instead, rules should be designed that can be used to handle exceptions generally.” Ref 4.3.6 B. Correct. The ‘keep it simple and practical’ guiding principle states: “When analyzing a practice, process, service, metric, or other improvement target, always ask whether it contributes to value creation.” Ref 4.3.6.1 C. Incorrect. “When designing, managing, or operating practices, be mindful of conflicting objectives ... the organization should agree on a balance between its competing objectives.” Ref 4.3.6.2 D. Incorrect. “It is better to start with an uncomplicated approach and then carefully add controls, activities, or metrics when it is seen that they are truly needed.” Ref 4.3.6.1"
      },
      {
        "number": 38,
        "prompt": "What should be done first when applying the ‘focus on value’ guiding principle?",
        "choices": {
          "A": "Identify the outcomes that the service facilitates",
          "B": "Identify all suppliers and partners involved in the service",
          "C": "Determine who the service consumer is in each situation",
          "D": "Determine the cost of providing the service"
        },
        "answer": "C",
        "syllabusRef": "2.2.a",
        "rationale": "A. Incorrect. It is essential to determine who the service consumer is, and what they value. The outcomes should be based on this understanding, rather than determining them. “The first step in focusing on value is knowing who is being served. In each situation the service provider must, therefore, determine who the service consumer is”. Ref 4.3.1.1 B. Incorrect. Suppliers and partners are possible stakeholders, but it is important to identify the service consumer first. “The first step in focusing on value is knowing who is being served. In each situation the service provider must, therefore, determine who the service consumer is”. Ref 4.3.1.1 C. Correct. “The first step in focusing on value is knowing who is being served. In each situation the service provider must, therefore, determine who the service consumer is”. Ref 4.3.1.1 D. Incorrect. The cost of providing the service may have some impact on the value from the perspective of the service provider. But “The first step in focusing on value is knowing who is being served. In each situation the service provider must, therefore, determine who the service consumer is”. Ref 4.3.1.1"
      },
      {
        "number": 39,
        "prompt": "A service provider describes a package that includes a laptop with software, licenses, and support. What is this package an example of?",
        "choices": {
          "A": "Value",
          "B": "An outcome",
          "C": "Warranty",
          "D": "A service offering"
        },
        "answer": "D",
        "syllabusRef": "1.3.a",
        "rationale": "A. Incorrect. The combination of things described in this option may help to create value, but it is not an example of value. Value is “the perceived benefits, usefulness and importance of something.” Ref 2.1 B. Incorrect. The combination of things described in this option may help to create an outcome, but it is not an example of an outcome. Outcome is “a result for a stakeholder enabled by one or more outputs.” Ref 2.5.1 C. Incorrect. Warranty is “assurance that a product or service will meet agreed requirements.” New functionality may or may not affect warranty. Ref 2.5.4 D. Correct. Service providers define combinations of goods, access to resources and service actions, to address the needs of different consumer groups. These combinations are called service offerings. Ref 2.3.2"
      },
      {
        "number": 40,
        "prompt": "What is the definition of warranty?",
        "choices": {
          "A": "A tangible or intangible deliverable that is produced by carrying out an activity",
          "B": "The assurance that a product or service will meet agreed requirements",
          "C": "A possible event that could cause harm or loss, or make it more difficult to achieve objectives",
          "D": "The functionality offered by a product or service to meet a particular need"
        },
        "answer": "B",
        "syllabusRef": "1.1.c",
        "rationale": "A. Incorrect. An output is “A tangible or intangible deliverable of an activity”. Ref 2.5.1 B. Correct. Warranty is “assurance that a product or service will meet agreed requirements.” Ref 2.5.4 C. Incorrect. A risk is “a possible event that could cause harm or loss, or make it more difficult to achieve objectives”. Ref 2.5.3 D. Incorrect. Utility is “the functionality offered by a product or service to meet a particular need”. Ref 2.5.4"
      }
    ]
  },
  {
    "id": "paper-2",
    "title": "Sample Paper 2",
    "subtitle": "ITIL 4 Foundation",
    "questionCount": 40,
    "passMark": 26,
    "recommendedMinutes": 60,
    "questions": [
      {
        "number": 1,
        "prompt": "What is the effect of increased automation on the 'service desk' practice?",
        "choices": {
          "A": "Greater ability to focus on customer experience when personal contact is needed",
          "B": "Decrease in self-service incident logging and resolution",
          "C": "Increased ability to focus on fixing technology instead of supporting people",
          "D": "Elimination of the need to escalate incidents to support teams"
        },
        "answer": "A",
        "syllabusRef": "7.1.f",
        "rationale": "A. Correct. \"With increased automation… The impact on service desks is reduced phone contact, less low-level work, and a greater ability to focus on excellent CX when personal contact is needed\". Ref 5.2.14 B. Incorrect. The effect of automation is to increase self-service, not to decrease it. \"With increased automation, AI, robotic process automation (RPA), and chatbots, service desks are moving to provide more self-service logging and resolution directly via online portals and mobile applications\". Ref 5.2.14 C. Incorrect. The opposite is true. \"With increased automation and the gradual removal of technical debt, the focus of the service desk is to provide support for ‘people and business’ rather than simply technical issues\". Ref 5.2.14 D. Incorrect. The use of automation will not eliminate the need to escalate incidents. \"A key point to be understood is that, no matter how efficient the service desk and its people are, there will always be issues that need escalation and underpinning support from other teams\". Ref 5.2.14"
      },
      {
        "number": 2,
        "prompt": "Which term describes the functionality offered by a service?",
        "choices": {
          "A": "Cost",
          "B": "Utility",
          "C": "Warranty",
          "D": "Risk"
        },
        "answer": "B",
        "syllabusRef": "1.2.g",
        "rationale": "A. Incorrect. Cost is \"The amount of money spent on a specific activity or resource.\" Ref 2.5.2 B. Correct. Utility is \"The functionality offered by a product or service.\" Ref 2.5.4 C. Incorrect. Warranty is \"Assurance that a product or service will meet agre ed requirements\". Ref 2.5.4 D. Incorrect. A risk is \"A possible event that could cause harm or loss, or make it more difficult to achieve objectives\". Ref 2.5.3"
      },
      {
        "number": 3,
        "prompt": "Which is the purpose of the 'monitoring and event management' practice?",
        "choices": {
          "A": "To ensure that accurate and reliable information about the configuration of services is available when and where it is needed",
          "B": "To systematically observe services and service components, and record and report selected changes of state",
          "C": "To protect the information needed by the organization to conduct its business",
          "D": "To minimize the negative impact of incidents by restoring normal service operation as quickly as possible"
        },
        "answer": "B",
        "syllabusRef": "6.1.e",
        "rationale": "A. Incorrect. \"The purpose of the service configuration management practice is to ensure that accurate and reliable information about the configuration of services, and the CIs that support them, is available when and where it is needed\". Ref 5.2.11 B. Correct. \"The purpose of the monitoring and event management practice is to systematically observe services and service components, and record and report selected changes of state identified as events\". Ref 5.2.7 C. Incorrect. \"The purpose of the information security management practice is to protect the information needed by the organization to conduct its business\". Ref 5.1.3 D. Incorrect. \"The purpose of the incident management practice is to minimize the negative impact of incidents by restoring normal service operation as quickly as possible\". Ref 5.2.5"
      },
      {
        "number": 4,
        "prompt": "What should all 'continual improvement' decisions be based on?",
        "choices": {
          "A": "Details of how services are measured",
          "B": "Accurate and carefully analyzed data",
          "C": "An up-to-date balanced scorecard",
          "D": "A recent maturity assessment"
        },
        "answer": "B",
        "syllabusRef": "7.1.a",
        "rationale": "A. Incorrect. How services are measured is important, however only accurate data can drive fact-based decisions for improvement. Ref 5.1.2 B. Correct. \"Accurate data, carefully analyzed and understood, is the foundation of fact-based decision-making for improvement.\" The 'continual improvement' practice should be supported by relevant data sources and by skilled data analytics to ensure that each potential improvement situation is sufficiently understood. Ref 5.1.2 C. Incorrect. A balanced scorecard is one input to making a decision, but on its own it does not serve as the foundation for fact-based decisions. Ref 5.1.2 D. Incorrect. Maturity assessments are useful but they provide only one piece of information, as opposed to providing the foundations for decision-making in the continual improvement practice. Ref 5.1.2"
      },
      {
        "number": 5,
        "prompt": "How do all value chain activities transform inputs to outputs?",
        "choices": {
          "A": "By determining service demand",
          "B": "By using a combination of practices",
          "C": "By using a single functional team",
          "D": "By implementing process automation"
        },
        "answer": "B",
        "syllabusRef": "5.1",
        "rationale": "A. Incorrect. Demand is the input to the service value chain. Value chain activities \"represent the steps an organization takes in the creation of value. Each activity contributes to the value chain by transforming specific inputs into outputs.\" Ref 4.5 B. Correct. \"To convert inputs into outputs, the value chain activities use different combinations of ITIL practices.\" Ref 4.5 C. Incorrect. It uses various resources from different practices when needed. \"To convert inputs into outputs, the value chain activities use different combinations of ITIL practices (sets of resources for performing certain types of work), drawing on internal or third-party resources, processes, skills, and competencies as required.” Ref 4.5 D. Incorrect. The 'optimize and automate' guiding principle recommends that activities should be automated where this is practical but the service value chain does not require automation. \"Technology should not always be relied upon without the capability of human intervention, as automation for automation's sake can increase costs and reduce organizational robustness and resilience.\" Ref 4.3.7"
      },
      {
        "number": 6,
        "prompt": "How does customer engagement contribute to the 'service level management' practice? 1. It captures information that metrics can be based on 2. It ensures the organization meets defined service levels 3. It defines the workflows for service requests 4. It supports progress discussions",
        "choices": {
          "A": "1 and 2",
          "B": "2 and 3",
          "C": "3 and 4",
          "D": "1 and 4"
        },
        "answer": "D",
        "syllabusRef": "7.1.g",
        "rationale": "D. Correct. (1) (4) \"Customer engagement: This involves initial listening, discovery, and information capture on which to base metrics, measurement, and ongoing progress discussions.\" Ref 5.2.15 A, B, C. Incorrect. (2) Service level management \"ensures the organization meets the defined service levels through the collection, analysis, storage, and reporting of the relevant metrics for the identified services,\" not just through customer engagement. Ref 5.2.15 (3) It may define the requirements for service requests but defining the workflow is part of ‘service request management’. \"When new service requests need to be added to the service catalogue, existing workflow models should be leveraged whenever possible.\" Ref 5.2.16"
      },
      {
        "number": 7,
        "prompt": "What is the starting point for optimization?",
        "choices": {
          "A": "Securing stakeholder engagement",
          "B": "Understanding the vision and objectives of the organization",
          "C": "Determining where the most positive impact would be",
          "D": "Standardizing practices and services"
        },
        "answer": "B",
        "syllabusRef": "2.2.g",
        "rationale": "A. Incorrect. This is step 4 of the principle 'optimize and automate': \"Ensure the optimization has the appropriate level of stakeholder engagement and commitment.\" Ref 4.3.7.1 B. Correct. The first step of the principle 'optimize and automate' is: \"Understand and agree the context in which the proposed optimization exists. This includes agreeing the overall vision and objectives of the organization.\" Ref 4.3.7.1 C. Incorrect. This is step 2 of the principle 'optimize and automate': \"Assess the current state of the proposed optimization. This will help to understand where it can be improved and which improvement opportunities are likely to produce the biggest positive impact.\" Ref 4.3.7.1 D. Incorrect. This is step 3 of the principle 'optimize and automate': \"Agree what the future state and priorities of the organization should be, focusing on simplification and value. This typically also includes standardization of practices and services, which will make it easier to automate or optimize further at a later point.\" Ref 4.3.7.1"
      },
      {
        "number": 8,
        "prompt": "Identify the missing words in the following sentence. The purpose of the [?] is to ensure that the organization continually co-creates value with all stakeholders in line with the organization's objectives.",
        "choices": {
          "A": "‘focus on value’ guiding principle",
          "B": "four dimensions of service management",
          "C": "service value system",
          "D": "‘service request management’ practice"
        },
        "answer": "C",
        "syllabusRef": "4.1",
        "rationale": "A. Incorrect. The 'focus on value' guiding principle guides an organization to consider the needs of the service consumer. It cannot ensure that the organization continually co-creates value with all stakeholders. Ref 4.3.1 B. Incorrect. The four dimensions \"represent perspectives which are relevant to the whole SVS, including the entirety of the service value chain and all ITIL practices.\" They do not ensure that the organization continually co-creates value with all stakeholders. Ref 3 C. Correct. \"The purpose of the SVS is to ensure that the organization continually co-creates value with all stakeholders through the use and management of products and services.\" Ref 4.1 D. Incorrect. The purpose of the 'service request management' practice is to \"support the agreed quality of a service by handling all pre-defined, user-initiated service requests in an effective and user-friendly manner.\" It doesn't ensure that the organization continually co-creates value with all stakeholders. Ref 5.2.16"
      },
      {
        "number": 9,
        "prompt": "Which practice provides support for managing feedback, compliments and complaints from users?",
        "choices": {
          "A": "Change enablement",
          "B": "Service request management",
          "C": "Problem management",
          "D": "Incident management"
        },
        "answer": "B",
        "syllabusRef": "7.1.e",
        "rationale": "A. Incorrect. \"The purpose of the change enablement practice is to maximize the number of successful service and product changes by ensuring that risks have been properly assessed, authorizing changes to proceed, and managing the change schedule.” Ref 5.2.4 B. Correct. \"The purpose of the service request management practice is to support the agreed quality of a service by handling all pre-defined, user-initiated service requests in an effective and user-friendly manner,\" and \"Each service request may include one or more of the following: ... feedback, compliments, and complaints (for example, complaints about a new interface or compliments to a support team).\" Ref 5.2.16 C. Incorrect. \"The purpose of the problem management practice is to reduce the likelihood and impact of incidents by identifying actual and potential causes of incidents, and managing workarounds and known errors.\" Ref 5.2.8 D. Incorrect. \"The purpose of the incident management practice is to minimize the negative impact of incidents by restoring normal service operation as quickly as possible.\" Ref 5.2.5"
      },
      {
        "number": 10,
        "prompt": "Which joint activity performed by a service provider and service consumer ensures continual value co-creation?",
        "choices": {
          "A": "Service provision",
          "B": "Service consumption",
          "C": "Service offering",
          "D": "Service relationship management"
        },
        "answer": "D",
        "syllabusRef": "1.3.b",
        "rationale": "A. Incorrect. Service provision is not a joint activity; it is performed by a service provider. Ref 2.4.1 B. Incorrect. Service consumption is not a joint activity; it is performed by a service consumer. Ref 2.4.1 C. Incorrect. Service offering is not an activity; it is \"A description of one or more services, designed to address the needs of a target consumer group. A service offering may include goods, access to resources, and service actions\". Ref 2.3.2 D. Correct. Service relationship management is \"Joint activities performed by a service provider and a service consumer to ensure continual value co-creation based on agreed and available service offerings\". Ref 2.4.1"
      },
      {
        "number": 11,
        "prompt": "Which practice may involve the initiation of disaster recovery?",
        "choices": {
          "A": "Incident management",
          "B": "Service request management",
          "C": "Service level management",
          "D": "IT asset management"
        },
        "answer": "A",
        "syllabusRef": "7.1.c",
        "rationale": "A. Correct. \"In some extreme cases, disaster recovery plans may be invoked to resolve an incident.\" Ref 5.2.5 B. Incorrect. \"Service requests are a normal part of service delivery and are not a failure or degradation of service, which are handled as incidents.\" Ref 5.2.16 C. Incorrect. \"The purpose of the service level management practice is to set clear business-based targets for service levels, and to ensure that delivery of services is properly assessed, monitored, and managed against these targets.\" Ref 5.2.15 D. Incorrect. \"The purpose of the IT asset management practice is to plan and manage the full lifecycle of all IT assets.\" Asset management \"includes the acquisition, operation, care and disposal of organizational assets.\" Ref 5.2.6"
      },
      {
        "number": 12,
        "prompt": "What type of change is MOST likely to be managed by the 'service request management' practice?",
        "choices": {
          "A": "A normal change",
          "B": "An emergency change",
          "C": "A standard change",
          "D": "An application change"
        },
        "answer": "C",
        "syllabusRef": "7.1.e",
        "rationale": "A. Incorrect. \"Normal changes: These are changes that need to be scheduled, assessed, and authorized\". This is supported by the ‘change enablement’ practice, not by 'service request management'. Ref 5.2.4 B. Incorrect. \"As far as possible, emergency changes should be subject to the same testing, assessment, and authorization as normal changes.\" This is supported by the ‘change enablement’ practice, not by 'service request management'. Ref 5.2.4 C. Correct. \"Fulfilment of service requests may include changes to services or their components; usually these are standard changes.\" and \"Standard changes : These are low-risk, pre-authorized changes that are well understood and fully documented, and can be implemented without needing additional authorization. They are often initiated as service requests\". Ref 5.2.16, 5.2.4 D. Incorrect. \"The scope of change enablement is defined by each organization. It will typically include all IT infrastructure, applications, documentation, processes\". Some application changes may be managed as standard changes, but others will be normal or emergency changes and will be supported by the 'change enablement' practice. Ref 5.2.4"
      },
      {
        "number": 13,
        "prompt": "Which guiding principle emphasizes the need to understand the flow of work in progress, identify bottlenecks, and uncover waste?",
        "choices": {
          "A": "Focus on value",
          "B": "Collaborate and promote visibility",
          "C": "Think and work holistically",
          "D": "Keep it simple and practical"
        },
        "answer": "B",
        "syllabusRef": "2.2.d",
        "rationale": "A. Incorrect. 'Focus on value' states that all improvement work should deliver measurable value for customers and other stakeholders, but it does not specifically highlight the need to understand the flow of work, identify bottlenecks, and uncover waste. Ref 4.3.1 B. Correct. ‘Collaborate and promote’ visibility states \"Insufficient visibility of work leads to poor decision-making, which in turn impacts the organization’s ability to improve internal capabilities. It will then become difficult to drive improvements as it will not be clear which ones are likely to have the greatest positive impact on results. To avoid this, the organization needs to perform such critical analysis activities as: understanding the flow of work in progress; identifying bottlenecks, as well as excess capacity; and uncovering waste\". Ref 4.3.4.3 C. Incorrect. 'Think and work holistically' states that the organization should work in an integrated way on the whole, not just on the parts, but it does not specifically highlight the need to understand the flow of work, identify bottlenecks, and uncove r waste. Ref 4.3.5 D. Incorrect. 'Keep it simple and practical' states that the organization should use the minimum number of steps, and eliminate steps that produce no useful outcome. This does imply that you should uncover waste, but it does not specific ally highlight the need to understand the flow of work and identify bottlenecks. Ref 4.3.6"
      },
      {
        "number": 14,
        "prompt": "What is a means of enabling value co-creation by facilitating outcomes that customers want to achieve?",
        "choices": {
          "A": "A service",
          "B": "An output",
          "C": "A practice",
          "D": "Continual improvement"
        },
        "answer": "A",
        "syllabusRef": "1.1.a",
        "rationale": "A. Correct. A service is \"A means of enabling value co-creation by facilitating outcomes that customers want to achieve, without the customer having to manage specific costs and risks.\" Ref 2.3.1 B. Incorrect. An output is \"A tangible or intangible deliverable of an activity.\" Ref 2.5.1 C. Incorrect. Practices are \"Sets of organizational resources designed for performing work or accomplishing an objective.\" Ref 4.1 D. Incorrect. 'Continual improvement' is a practice \"to align the organization’s practices and services with changing business needs.\" Ref 5.1.2"
      },
      {
        "number": 15,
        "prompt": "Which statement about change authorization is CORRECT?",
        "choices": {
          "A": "A change authority should be assigned to each type of change and change model",
          "B": "Centralizing change authorization to a single person is the most effective means of authorization",
          "C": "The authorization of normal changes should be expedited to ensure they can be implemented quickly",
          "D": "Standard changes are high risk and should be authorized by the highest level of change authority"
        },
        "answer": "A",
        "syllabusRef": "7.1.b",
        "rationale": "A. Correct. \"It is essential that the correct change authority is assigned to each type of change to ensure that change enablement is both efficient and effective.\" Ref 5.2.4 B. Incorrect. There is no rule that centralizing change authority is the most effective method. In some cases, decentralizing decision-making is better: \"In high-velocity organizations, it is a common practice to decentralize change approval, making the peer review a top predictor of high performance.\" Ref 5.2.4 C. Incorrect. This answer confuses normal changes with emergency changes. \"Emergency changes are not typically included in a change schedule, and the process for assessment and authorization is expedited to ensure they can be implemented quickly.\" Ref 5.2.4 D. Incorrect. Standard changes are usually low risk and pre-authorized. \"These are low-risk, pre-authorized changes that are well understood and fully documented, and can be implemented without needing additional authorization.\" Ref 5.2.4"
      },
      {
        "number": 16,
        "prompt": "Which dimension of service management considers governance, management, and communication?",
        "choices": {
          "A": "Organizations and people",
          "B": "Information and technology",
          "C": "Partners and suppliers",
          "D": "Value streams and processes"
        },
        "answer": "A",
        "syllabusRef": "3.1.a",
        "rationale": "A. Correct. \"It is important to ensure that the way an organization is structured and managed, as well as its roles, responsibilities, and systems of authority and communication, is well defined and supports its overall strategy and operating model.\" Ref 3.1 B. Incorrect. The 'information and technology' dimension \"includes the information and knowledge necessary for the management of services, as well as the technologies required. It also incorporates the relationships between different components of the SVS, such as the inputs and outputs of activities and practices.\" Ref 3.2 C. Incorrect. \"The partners and suppliers dimension encompasses an organization’s relationships with other organizations that are involved in the design, development, deployment, delivery, support and/or continual improvement of services. It also incorporates contracts and other agreements between the organization and its partners or suppliers.\" Ref 3.3 D. Incorrect. The 'value streams and processes' dimension \"is concerned with how the various parts of the organization work in an integrated and coordinated way to enable value creation through products and services.\" Ref 3.4"
      },
      {
        "number": 17,
        "prompt": "Identify the missing word in the following sentence. A known error is a problem that has been [?] and has not been resolved.",
        "choices": {
          "A": "logged",
          "B": "analyzed",
          "C": "escalated",
          "D": "closed"
        },
        "answer": "B",
        "syllabusRef": "6.2.g",
        "rationale": "A. Incorrect. A known error is ”A problem that has been analyzed but has not been resolved\". If a problem has been logged but not analyzed, it would not be considered a known error. Ref 5.2.8 B. Correct. A known error is ”A problem that has been analyzed but has not been resolved\". Ref 5.2.8 C. Incorrect. A known error is ”A problem that has been analyzed but has not been resolved\" – it may or may not be escalated. Ref 5.2.8 D. Incorrect. A known error is ”A problem that has been analyzed but has not been resolved\". If a problem has been closed, it would not be considered a known error. Ref 5.2.8"
      },
      {
        "number": 18,
        "prompt": "Which statement about known errors and problems is CORRECT?",
        "choices": {
          "A": "Known error is the status assigned to a problem after it has been analyzed",
          "B": "A known error is the cause of one or more problems",
          "C": "Known errors cause vulnerabilities, problems cause incidents",
          "D": "Known errors are managed by technical staff, problems are managed by service management staff"
        },
        "answer": "A",
        "syllabusRef": "7.1.d",
        "rationale": "A. Correct. Known errors \"are problems where initial analysis has been completed; it usually means that faulty components have been identified… the problem remains in the known error status, and the documented workaround is applied\". Ref 5.2.8 B. Incorrect. A problem is \"A cause, or potential cause, of one or more incidents.\" A known error is \"A problem that has been analyzed but has not been resolved.\" Known errors do not cause problems; they are problems that have been analyzed but not yet resolved. Ref 5.2.8 C. Incorrect. Both known errors and problems cause incidents. A problem is \"A cause, or potential cause, of one or more incidents.\" A known error is \"A problem that has been analyzed but has not been resolved.\" Both problems and known errors may be vulnerabilities: \"Every service has errors, flaws, or vulnerabilities that may cause incidents.\" Ref 5.2.8 D. Incorrect. \"Many problem management activities rely on the knowledge and experience of staff, rather than on following detailed procedures. People responsible for diagnosing problems often need the ability to understand complex systems, and to think about how different failures might have occurred. Developing this combination of analytic and creative ability requires mentoring and time, as we ll as suitable training.\" These people might work in a technical role, or in a service management role. Ref 5.2.8"
      },
      {
        "number": 19,
        "prompt": "What does the 'service request management' practice depend on for maximum efficiency?",
        "choices": {
          "A": "Compliments and complaints",
          "B": "Self-service tools",
          "C": "Processes and procedures",
          "D": "Incident management"
        },
        "answer": "C",
        "syllabusRef": "7.1.e",
        "rationale": "A. Incorrect. Compliments and complaints are examples of service requests. The efficiency of the practice does not depend on them. Ref 5.2.16 B. Incorrect. Many service requests are initiated and fulfilled using self-service tools, but not all are appropriate for this approach. Ref 5.2.16 C. Correct. \"Service request management is dependent upon well-designed processes and procedures, which are operationalized through tracking and automation tools to maximize the efficiency of the practice.\" Ref 5.2.16 D. Incorrect. \"Service requests are a normal part of service delivery and are not a failure or degradation of service, which are handled as incidents.\" Ref 5.2.16"
      },
      {
        "number": 20,
        "prompt": "Which statement about the 'service desk' practice is CORRECT?",
        "choices": {
          "A": "It provides a link with stakeholders at strategic and tactical levels",
          "B": "It carries out change assessment and authorization",
          "C": "It investigates the cause of incidents",
          "D": "It needs a practical understanding of the business processes"
        },
        "answer": "D",
        "syllabusRef": "7.1.f",
        "rationale": "A. Incorrect. This is a purpose of 'relationship management': \"to establish and nurture the links between the organization and its stakeholders at strategic and tactical levels.\" Ref 5.1.9 B. Incorrect. \"Service desks provide a clear path for users to report issues, queries, and requests, and have them acknowledged, classified, owned, and actioned.\" This does not include the assessment and authorization of changes. This will be provided by the 'change enablement' practice. Ref 5.2.14 C. Incorrect. Investigating the cause of incidents is a purpose of ‘problem management’. “The purpose of the problem management practice is to reduce the likelihood and impact of incidents by identifying actual and potential causes of incidents.” Ref 5.2.8 D. Correct. \"Another key aspect of a good service desk is its practical understanding of the wider organization, the business processes, and the users.\" Ref 5.2.14"
      },
      {
        "number": 21,
        "prompt": "Which practice ensures that accurate and reliable information is available about configuration items and the relationships between them?",
        "choices": {
          "A": "Service configuration management",
          "B": "Service desk",
          "C": "IT asset management",
          "D": "Monitoring and event management"
        },
        "answer": "A",
        "syllabusRef": "6.1.g",
        "rationale": "A. Correct. \"The purpose of the service configuration management practice is to ensure that accurate and reliable information about the configuration of services, and the CIs that support them, is available when and where it is needed. This includes information on how CIs are configured and the relationships between them\". Ref 5.2.11 B. Incorrect. \"The purpose of the service desk practice is to capture demand for incident resolution and service requests\". Ref 5.2.14 C. Incorrect. \"The purpose of the IT asset management practice is to plan and manage the full lifecycle of all IT assets, to help the organization: maximize value, control costs, manage risks, support decision-making about purchase, re-use, and disposal of assets\". Ref 5.2.6 D. Incorrect. \"The purpose of the monitoring and event management practice is to systematically observe services and service components, and record and report selected changes of state identified as events\". Ref 5.2.7"
      },
      {
        "number": 22,
        "prompt": "Which practice has a purpose that includes restoring normal service operation as quickly as possible?",
        "choices": {
          "A": "Supplier management",
          "B": "Deployment management",
          "C": "Problem management",
          "D": "Incident management"
        },
        "answer": "D",
        "syllabusRef": "6.1.k",
        "rationale": "A. Incorrect. \"The purpose of the supplier management practice is to ensure that the organization’s suppliers and their performances are managed appropriately to support the seamless provision of quality products and services.\" Ref 5.1.13 B. Incorrect. \"The purpose of the deployment management practice is to move new or changed hardware, software, documentation, processes, or any other component to live environments. It may also be involved in deploying components to other environments, for testing or staging.\" Ref 5.3.1 C. Incorrect. \"The purpose of the problem management practice is to reduce the likelihood and impact of incidents by identifying actual and potential causes of incidents, and managing workarounds and known errors.\" Ref 5.2.8 D. Correct. \"The purpose of the incident management practice is to minimize the negative impact of incidents by restoring normal service operation as quickly as possible.\" Ref 5.2.5"
      },
      {
        "number": 23,
        "prompt": "Identify the missing word in the following sentence. A customer is the role that defines the requirements for a service and takes responsibility for the [?] of service consumption.",
        "choices": {
          "A": "outputs",
          "B": "outcomes",
          "C": "costs",
          "D": "risks"
        },
        "answer": "B",
        "syllabusRef": "1.1.d",
        "rationale": "A. Incorrect. \"Customer: The role that defines the requirements for a service and takes responsibility for the outcomes of service consumption.\" Ref 2.2.2 B. Correct. \"Customer: The role that defines the requirements for a service and takes responsibility for the outcomes of service consumption.\" Ref 2.2.2 C. Incorrect. \"Customer: The role that defines the requirements for a service and takes responsibility for the outcomes of service consumption.\" Ref 2.2.2 D. Incorrect. \"Customer: The role that defines the requirements for a service and takes responsibility for the outcomes of service consumption.\" Ref 2.2.2"
      },
      {
        "number": 24,
        "prompt": "Which guiding principle describes the importance of doing something, instead of spending a long time analyzing different options?",
        "choices": {
          "A": "Optimize and automate",
          "B": "Start where you are",
          "C": "Focus on value",
          "D": "Progress iteratively with feedback"
        },
        "answer": "D",
        "syllabusRef": "2.2.c",
        "rationale": "A. Incorrect. 'Optimize and automate' says that you should understand and optimize something before you automate it. \"Attempting to automate something that is complex or suboptimal is unlikely to achieve the desired outcome.\" Ref 4.3.7.3 B. Incorrect. 'Start where you are' says that you should understand the current situation before making changes. \"Services and methods already in place should be measured and/or observed directly to properly understand their current state and what can be re-used from them. Decisions on how to proceed should be based on information that is as accurate as possible.\" Ref 4.3.2.1 C. Incorrect. 'Focus on value' says that each improvement iteration should create value for stakeholders \"All activities conducted by the organization should link back, directly or indirectly, to value for itself, its customers, and other stakeholders.\" Ref 4.3.1 D. Correct. ‘Progress iteratively with feedback’ recommends comprehending \"the whole, but do something: Sometimes the greatest enemy to progressing iteratively is the desire to understand and account for everything. This can lead to what has sometimes been called ‘analysis paralysis’, in which so much time is spent analyzing the situation that nothing ever gets done about it.\" Ref 4.3.3.3"
      },
      {
        "number": 25,
        "prompt": "What should be done for every problem?",
        "choices": {
          "A": "It should be diagnosed to identify possible solutions",
          "B": "It should be prioritized based on its potential impact and probability",
          "C": "It should be resolved so that it can be closed",
          "D": "It should have a workaround to reduce the impact"
        },
        "answer": "B",
        "syllabusRef": "7.1.d",
        "rationale": "A. Incorrect. \"It is not essential to analyze every problem; it is more valuable to make significant progress on the highest-priority problems than to investigate every minor problem that the organization is aware of.\" Ref 5.2.8 B. Correct. \"Problems are prioritized for analysis based on the risk that they pose, and are managed as risks based on their potential impact and probability.\" Ref 5.2.8 C. Incorrect. \"Error control also includes identification of potential permanent solutions which may result in a change request for implementation of a soluti on, but only if this can be justified in terms of cost, risks, and benefits.\" Ref 5.2.8 D. Incorrect. \"When a problem cannot be resolved quickly, it is often useful to find and document a workaround for future incidents, based on an understanding of the problem.\" Ref 5.2.8"
      },
      {
        "number": 26,
        "prompt": "How should an organization include third-party suppliers in the continual improvement of services?",
        "choices": {
          "A": "Ensure suppliers include details of their approach to service improvement in contracts",
          "B": "Require evidence that the supplier uses agile development methods",
          "C": "Require evidence that the supplier implements all improvements using project management practices",
          "D": "Ensure that all supplier problem management activities result in improvements"
        },
        "answer": "A",
        "syllabusRef": "7.1.a",
        "rationale": "A. Correct \"When contracting for a supplier’s service, the contract should include details of how they will measure, report on, and improve their services over the life of the contract.\" Ref 5.1.2 B. Incorrect. Agile methods do take an incremental approach, as they \"focus on making improvements incrementally at a cadence\"; however, this alone would not guarantee a supplier is committed to continual improvement. Ref 5.1.2 C. Incorrect. Many improvement initiatives use project management practices, but it may not be practical to do so for some. \"Many improvement initiatives will use project management practices to organize and manage their execution\", but not all improvement initiatives. Ref 5.1.2 D. Incorrect. Many 'problem management' activities will result in improvements, however not all supplier problems will result in improvements, so this is not a sensible approach. \"It is not essential to analyze every problem; it is more valuable to make significant progress on the highest-priority problems than to investigate every minor problem that the organization is aware of.\" Ref 5.2.8"
      },
      {
        "number": 27,
        "prompt": "What considerations influence the supplier strategy of an organization?",
        "choices": {
          "A": "Contracts and agreements",
          "B": "Type of cooperation with suppliers",
          "C": "Corporate culture of the organization",
          "D": "Level of formality"
        },
        "answer": "C",
        "syllabusRef": "3.1.c",
        "rationale": "A. Incorrect. \"The partners and suppliers dimension encompasses an organization’s relationships with other organizations that are involved in the design, development, deployment, delivery, support and/or continual improvement of services. It also incorporates contracts and other agreements between the organization and its partners or suppliers.\" These considerations depend on the supplier strategy, rather than influence it. Ref 3.3 B. Incorrect. The type of cooperation with suppliers depends on the supplier strategy, rather than influence it. The forms of cooperation \"are not fixed but exist as a spectrum. An organization acting as a service provider will have a position on this spectrum, which will vary depending on its strategy and objectives for customer relationships.\" Ref 3.3 C. Correct. \"Corporate culture: some organizations have a historical preference for one approach over another. Long-standing cultural bias is difficult to change without compelling reasons.\" Ref 3.3 D. Incorrect. The level of formality depends on the form of cooperation, which in turn depends on the supplier strategy. The forms of cooperation \"are not fixed but exist as a spectrum. An organization acting as a service provider will have a position on this spectrum, which will vary depending on its strategy and objectives for customer relationships.\" Ref 3.3"
      },
      {
        "number": 28,
        "prompt": "What is a problem?",
        "choices": {
          "A": "An addition or modification that could have an effect on services",
          "B": "Any change of state that has significance for the management of a configuration item",
          "C": "A cause or potential cause of one or more incidents",
          "D": "An unplanned reduction in the quality of a service"
        },
        "answer": "C",
        "syllabusRef": "6.2.f",
        "rationale": "A. Incorrect. Change is \"The addition, modification, or removal of anything that could have a direct or indirect effect on services.\" Ref 5.2.4 B. Incorrect. An event is \"Any change of state that has significance for the management of a service or other configuration item (CI). Events are typically recognized through notifications created by an IT service, CI, or monitoring tool.\" Ref 5.2.7 C. Correct. A problem is \"a cause, or potential cause, of one or more incidents.\" Ref 5.2.8 D. Incorrect. An incident is ”An unplanned interruption to a service or reduction in the quality of a service.\" Ref 5.2.5"
      },
      {
        "number": 29,
        "prompt": "What is the purpose of the 'relationship management' practice?",
        "choices": {
          "A": "To align the organization's practices and services with changing business needs",
          "B": "To establish and nurture the links between the organization and its stakeholders at strategic and tactical levels",
          "C": "To reduce the likelihood and impact of incidents by identifying actual and potential causes of incidents, and managing workarounds and known errors",
          "D": "To minimize the negative impact of incidents by restoring normal service operation as quickly as possible"
        },
        "answer": "B",
        "syllabusRef": "6.1.b",
        "rationale": "A. Incorrect. \"The purpose of the continual improvement practice is to align the organization’s practices and services with changing business needs through the ongoing improvement of products, services, and practices, or any element involved in the management of products and services.\" Ref 5.1.2 B. Correct. \"The purpose of the relationship management practice is to establish and nurture the links between the organization and its stakeholders at strategic and tactical levels. It includes the identification, analysis, monitoring, and continual improvement of relationships with and between stakeholders.\" Ref 5.1.9 C. Incorrect. \"The purpose of the problem management practice is to reduce the likelihood and impact of incidents by identifying actual and potential causes of incidents, and managing workarounds and known errors.\" Ref 5.2.8 D. Incorrect. \"The purpose of the incident management practice is to minimize the negative impact of incidents by restoring normal service operation as quickly as possible.\" Ref 5.2.5"
      },
      {
        "number": 30,
        "prompt": "Which is intended to help an organization adopt and adapt ITIL guidance?",
        "choices": {
          "A": "The four dimensions of service management",
          "B": "The guiding principles",
          "C": "The service value chain",
          "D": "Practices"
        },
        "answer": "B",
        "syllabusRef": "2.1",
        "rationale": "A. Incorrect. \"To support a holistic approach to service management, ITIL defines four dimensions that collectively are critical to the effective and efficient facilitation of value for customers and other stakeholders in the form of products and services.\" Adopting ITIL to address these four dimensions of ITSM helps to facilitate value but does not help the organization to adapt ITIL guidance to its organization. Ref 3 B. Correct. The guiding principles can \"guide organizations in their work as they adopt a service management approach and adapt ITIL guidance to their own specific needs and circumstances.\" Ref 4.3 C. Incorrect. \"Service value chain: A set of interconnected activities that an organization performs to deliver a valuable product or service to its consumers and to facilitate value realization.\" Adopting a service value chain helps to facilitate v alue but does not help the organization to adapt ITIL guidance to its organization. Ref 4.1 D. Incorrect. Practices are sets of organizational resources designed for performing work or accomplishing an objective. They do not help the organization to adapt ITIL guidance to its organization. Ref 4.1"
      },
      {
        "number": 31,
        "prompt": "What is an output?",
        "choices": {
          "A": "A change of state that has significance for the management of a configuration item",
          "B": "A possible event that could cause harm or loss",
          "C": "A result for a stakeholder",
          "D": "Something created by carrying out an activity"
        },
        "answer": "D",
        "syllabusRef": "1.2.e",
        "rationale": "A. Incorrect. An event is: \"Any change of state that has significance for the management of a service or other configuration item (CI). Events are typically recognized through notifications created by an IT service, CI, or monitoring tool.\" Ref 5.2.7 B. Incorrect. Risk is \"A possible event that could cause harm or loss, or make it more difficult to achieve objectives.\" Ref 2.5.3 C. Incorrect. An outcome is \"A result for a stakeholder enabled by one or more outputs.\" Ref 2.5.1 D. Correct. An output is \"A tangible or intangible deliverable of an activity\". Ref 2.5.1"
      },
      {
        "number": 32,
        "prompt": "What is the reason for using a balanced bundle of service metrics?",
        "choices": {
          "A": "It reduces the number of metrics that need to be collected",
          "B": "It reports each service element separately",
          "C": "It provides an outcome-based view of services",
          "D": "It facilitates the automatic collection of metrics"
        },
        "answer": "C",
        "syllabusRef": "7.1.g",
        "rationale": "A. Incorrect. There would not be fewer metrics gathered, although it would combine and aggregate them to provide clearer information. \"The practice requires pragmatic focus on the whole service and not simply its constituent parts; for example, simple individual metrics (such as percentage system availability) should not be taken to represent the whole service.\" Ref 5.2.15 B. Incorrect. The reason is to reduce reporting of the individual system-based metrics which are not meaningful to the customer. \"They should relate to defined outcomes and not simply operational metrics. This can be achieved with balance d bundles of metrics.\" Ref 5.2.15.1 C. Correct. \"They should relate to defined outcomes and not simply operational metrics. This can be achieved with balanced bundles of metrics.\" Ref 5.2.15.1 D. Incorrect. This does not affect the mechanism for metric collection. \"The practice requires pragmatic focus on the whole service and not simply its constituent parts; for example, simple individual metrics (such as percentage system availability) should not be taken to represent the whole service.\" Ref 5.2.15"
      },
      {
        "number": 33,
        "prompt": "Why should incidents be prioritized?",
        "choices": {
          "A": "To help automated matching of incidents to problems or known errors",
          "B": "To identify which support team the incident should be escalated to",
          "C": "To ensure that incidents with the highest business impact are resolved first",
          "D": "To encourage a high level of collaboration within and between teams"
        },
        "answer": "C",
        "syllabusRef": "7.1.c",
        "rationale": "A. Incorrect. \"Modern IT service management tools can provide automated matching of incidents to other incidents, problems or known errors,\" but this is not dependent on the incident priority, which is used to ensure that incidents with the highest business impact are resolved first. Ref 5.2.5 B. Incorrect. \"More complex incidents will usually be escalated to a support team for resolution. Typically, the routing is based on the incident category, which should help to identify the correct team.\" Ref 5.2.5 C. Correct. \"Incidents are prioritized based on an agreed classification to ensure that incidents with the highest business impact are resolved first.\" Ref 5.2.5 D. Incorrect. \"Effective incident management often requires a high level of collaboration within and between teams.\" However, this is not dependent on the incident priority, which is used to \"ensure that incidents with the highest business impact are resolved first\". Ref 5.2.5"
      },
      {
        "number": 34,
        "prompt": "Which practice has a purpose that includes helping the organization to maximize value, control costs and manage risks?",
        "choices": {
          "A": "Relationship management",
          "B": "IT asset management",
          "C": "Release management",
          "D": "Service desk"
        },
        "answer": "B",
        "syllabusRef": "6.1.d",
        "rationale": "A. Incorrect. \"The purpose of the relationship management practice is to establish and nurture the links between the organization and its stakeholders at strategic and tactical levels.\" Ref 5.1.9 B. Correct. \"The purpose of the IT asset management practice is to plan and manage the full lifecycle of all IT assets, to help the organization: maximize value, control costs, manage risks.\" Ref 5.2.6 C. Incorrect. \"The purpose of the release management practice is to make new an d changed services and features available for use.\" Ref 5.2.9 D. Incorrect. \"The purpose of the service desk practice is to capture demand for incident resolution and service requests.\" Ref 5.2.14"
      },
      {
        "number": 35,
        "prompt": "Why should service desk staff detect recurring issues?",
        "choices": {
          "A": "To help identify problems",
          "B": "To escalate incidents to the correct support team",
          "C": "To ensure effective handling of service requests",
          "D": "To engage the correct change authority"
        },
        "answer": "A",
        "syllabusRef": "7.1.d",
        "rationale": "A. Correct. \"Problem identification activities identify and log problems. These include:... detection of duplicate and recurring issues by users, service desk, and technical support staff.\" Ref 5.2.8 B. Incorrect. Identifying the correct team for escalating an incident is based on incident category, not recurring incidents. \"More complex incidents will usually be escalated to a support team for resolution. Typically, the routing is based on the incident category, which should help to identify the correct team.\" Ref 5.2.5 C. Incorrect. \"The purpose of the service request management practice is to support the agreed quality of a service by handling all pre-defined, user-initiated service requests in an effective and user-friendly manner.\" Detection of recurring issues by the service desk is not required to do this. Ref 5.2.16 D. Incorrect. \"The person or group who authorizes a change is known as a change authority. It is essential that the correct change authority is assigned to each type of change to ensure that change enablement is both efficient and effective.\" This assignment is based on the type of change, and detection of recurring issues by the service desk is not required to do this. Ref 5.2.4"
      },
      {
        "number": 36,
        "prompt": "Which value chain activity communicates the current status of all four dimensions of service management?",
        "choices": {
          "A": "Improve",
          "B": "Engage",
          "C": "Obtain/build",
          "D": "Plan"
        },
        "answer": "D",
        "syllabusRef": "5.2.a",
        "rationale": "A. Incorrect. \"The purpose of the improve value chain activity is to ensure continual improvement of products, services, and practices across all value chain activities and the four dimensions of service management.\" Ref 4.5.2 B. Incorrect. \"The purpose of the engage value chain activity is to provide a good understanding of stakeholder needs, transparency, and continual engagement and good relationships with all stakeholders.\" Ref 4.5.3 C. Incorrect. \"The purpose of the obtain/build value chain activity is to ensure that service components are available when and where they are needed, and meet agreed specifications.\" Ref 4.5.5 D. Correct. \"The purpose of the plan value chain activity is to ensure a shared understanding of the vision, current status, and improvement direction for all four dimensions and all products and services across the organization.\" Ref 4.5.1"
      },
      {
        "number": 37,
        "prompt": "Which guiding principle is PRIMARILY concerned with consumer's revenue and growth?",
        "choices": {
          "A": "Keep it simple and practical",
          "B": "Optimize and automate",
          "C": "Progress iteratively with feedback",
          "D": "Focus on value"
        },
        "answer": "D",
        "syllabusRef": "2.2.a",
        "rationale": "A. Incorrect. The emphasis of this principle is on how to approach activities: \"Always use the minimum number of steps to accomplish an objective. Outcome -based thinking should be used to produce practical solutions that deliver valuabl e outcomes.\" Ref 4.3.6 B. Incorrect. This principle is focused on increased effectiveness and efficiency. \"Organizations must maximize the value of the work carried out by their human and technical resources.\" Ref 4.3.7 C. Incorrect. This shows how to approach making changes. \"Resist the temptation to do everything at once. Even huge initiatives must be accomplished iteratively. By organizing work into smaller, manageable sections that can be executed and completed in a timely manner, the focus on each effort will be sharper and easier to maintain.\" Ref 4.3.3 D. Correct. \"This section is mostly focused on the creation of value for service consumers... This value may come in various forms, such as revenue, customer loyalty, lower cost, or growth opportunities.\" Ref 4.3.1"
      },
      {
        "number": 38,
        "prompt": "Which practice provides visibility of the organization's services by capturing and reporting on service performance?",
        "choices": {
          "A": "Service desk",
          "B": "Service level management",
          "C": "Service request management",
          "D": "Service configuration management"
        },
        "answer": "B",
        "syllabusRef": "7.1.g",
        "rationale": "A. Incorrect. \"Service desks provide a clear path for users to report issues, queries, and requests, and have them acknowledged, classified, owned, and actioned.\" Ref 5.2.14 B. Correct. \"Service level management provides the end-to-end visibility of the organization’s services. To achieve this, service level management:... captures and reports on service issues, including performance against defined service levels.\" Ref 5.2.14 C. Incorrect. \"A request from a user or a user’s authorized representative that initiates a service action which has been agreed as a normal part of service delivery.\" Ref 5.2.15 D. Incorrect. \"Service configuration management collects and manages information about a wide variety of CIs, typically including hardware, software, networks, buildings, people, suppliers, and documentation.\" Ref 5.2.11"
      },
      {
        "number": 39,
        "prompt": "Which is the BEST example of an emergency change?",
        "choices": {
          "A": "The implementation of a planned new release of a software application",
          "B": "A low-risk computer upgrade implemented as a service request",
          "C": "The implementation of a security patch to a critical software application",
          "D": "A scheduled major hardware and software implementation"
        },
        "answer": "C",
        "syllabusRef": "7.1.b",
        "rationale": "A. Incorrect. Emergency changes \"are changes that must be implemented as soon as possible; for example, to resolve an incident or implement a security patch.\" The implementation of a planned new release of a software application does not fall into this category and would be planned and implemented as a normal change. Ref 5.2.4 B. Incorrect. Emergency changes \"are changes that must be implemented as soon as possible; for example, to resolve an incident or implement a security patch.\" A low-risk computer upgrade implemented as a service request does not fall into this category. Using a service request implies that this is a standard change, as standard changes \"are often initiated as service requests.\" Ref 5.2.4 C. Correct. Emergency changes are \"Changes that must be implemented as soon as possible; for example, to resolve an incident or implement a security patch.\" Ref 5.2.4 D. Incorrect. Emergency changes \"must be implemented as soon as possible; for example, to resolve an incident or implement a security patch. Emergency changes are not typically included in a change schedule, and the process for assessment and authorization is expedited to ensure they can be implemented quickly.\" A scheduled major hardware and software implementation does not fall into this category and would be planned and implemented as a normal change. Ref 5.2.4"
      },
      {
        "number": 40,
        "prompt": "Which guiding principle recommends assessing the current state and deciding what can be reused?",
        "choices": {
          "A": "Focus on value",
          "B": "Start where you are",
          "C": "Collaborate and promote visibility",
          "D": "Progress iteratively with feedback"
        },
        "answer": "B",
        "syllabusRef": "2.2.b",
        "rationale": "A. Incorrect. The guiding principle 'focus on value' advises \"All activities conducted by the organization should link back, directly or indirectly, to value for itself, its customers, and other stakeholders.\" This is not the main concern of the guiding principle 'start where you are'. Ref 4.3.1 B. Correct. The guiding principle 'start where you are' advises \"Having a proper understanding of the current state of services and methods is important to selecting which elements to re-use, alter, or build upon.\" Ref 4.3.2.3 C. Incorrect. The focus of the guiding principle 'collaborate and promote visibility' is on involving the right stakeholders and communicating with them. \"When initiatives involve the right people in the correct roles, efforts benefit from better buy-in, more relevance (because better information is available for decision-making) and increased likelihood of long-term success\". This is not the main concern of the guiding principle 'start where you are'. Ref 4.3.4 D. Incorrect. The main concern of the guiding principle 'progress iterativel y with feedback' is breaking initiatives into smaller parts. \"By organizing work into smaller, manageable sections that can be executed and completed in a timely manner, the focus on each effort will be sharper and easier to maintain.\" This is not the main concern of the guiding principle 'start where you are'. Ref 4.3.3"
      }
    ]
  }
];
