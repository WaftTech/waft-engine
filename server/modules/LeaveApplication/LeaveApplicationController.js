const HttpStatus = require('http-status');
const otherHelper = require('../../helper/others.helper');
const LeaveApplicationModel = require('./LeaveApplication');
const isEmpty = require('../../validation/isEmpty');
const LeaveApplicationConfig = require('./LeaveApplicationConfig');
const LeaveApplicationController = {};

const CreateLeaveInternal = require('./../CreateLeave/CreateLeaveController').Internal;
const FiscalYearInternal = require('./../fiscal/fiscalController').Internal;
const LeaveTypeInternal = require('./../LeaveType/LeaveTypeController').Internal;
const HolidayInternal = require('./../holidaylist/holidayController').Internal;
const settingsInternal = require('./../Settings/settingsController').Internal;
const employeeInternal = require('./../Users/UserController').Internal;

const moment = require('moment');
moment().format();

LeaveApplicationController.GetLeaveApplication = async (req, res, next) => {
  let page;
  const size_default = 10;
  let size;
  let searchquery;
  let sortquery;
  let selectquery;
  let populate;
  if (req.query.page && !isNaN(req.query.page) && req.query.page != 0) {
    page = Math.abs(req.query.page);
  } else {
    page = 1;
  }
  if (req.query.size && !isNaN(req.query.size) && req.query.size != 0) {
    size = Math.abs(req.query.size);
  } else {
    size = size_default;
  }
  if (req.query.sort) {
    let sortfield = req.query.sort.slice(1);
    let sortby = req.query.sort.charAt(0);
    if (sortby == 1 && !isNaN(sortby)) {
      //1 is for asscending
      sortquery = sortfield;
    } else if (sortby == 0 && !isNaN(sortby)) {
      // 0 is for Descending
      sortquery = '-' + sortfield;
    } else {
      sortquery = '';
    }
  }

  //get user roles
  let userinfo = await employeeInternal.getUnderUserList(req.user.id);

  //adding own info
  userinfo.push({ _id: req.user.id, name: req.user.name });

  searchquery = { IsDeleted: false, EmployID: { $in: userinfo } };

  if (req.query.find_IsHalfDay) {
    if (req.query.find_IsHalfDay == 0) {
      //0 for true
      searchquery = { IsHalfDay: true, ...searchquery };
    } else {
      searchquery = { IsHalfDay: false, ...searchquery };
    }
  }
  if (req.query.find_NoOfDays) {
    searchquery = { NoOfDays: req.query.find_NoOfDays, ...searchquery };
  }
  if (req.query.find_SubmittedTo) {
    searchquery = {
      SubmittedTo: { $regex: req.query.find_SubmittedTo, $options: 'i x' },
      ...searchquery,
    };
  }
  if (req.query.find_SubmittedBy) {
    searchquery = {
      SubmittedBy: { $regex: req.query.find_SubmittedBy, $options: 'i x' },
      ...searchquery,
    };
  }
  if (req.query.find_Added_by) {
    searchquery = {
      Added_by: { $regex: req.query.find_Added_by, $options: 'i x' },
      ...searchquery,
    };
  }

  selectquery = 'IsHalfDay FromIsHalfDay ToIsHalfDay NoOfDays To From EmployID LeaveTypeID Added_by Added_at Status Remarks';

  populate = [{ path: 'LeaveTypeID', select: 'LeaveName LeaveNameNepali' }, { path: 'EmployID', select: 'name nameNepali' }, { path: 'Added_by', select: 'name nameNepali' }];

  let datas = await otherHelper.getquerySendResponse(LeaveApplicationModel, page, size, sortquery, searchquery, selectquery, next, populate);

  return otherHelper.paginationSendResponse(res, HttpStatus.OK, true, datas.data, LeaveApplicationConfig.ValidationMessage.GetLeaveApplication, page, size, datas.totaldata);
};

LeaveApplicationController.GetLeaveApplicationByID = async (req, res, next) => {
  try {
    let data = await LeaveApplicationModel.findOne({ _id: req.params.id, IsDeleted: false }).select('IsHalfDay FromIsHalfDay ToIsHalfDay NoOfDays To From EmployID LeaveTypeID Added_by Added_at Status Remarks');
    return otherHelper.sendResponse(res, HttpStatus.OK, true, data, null, LeaveApplicationConfig.ValidationMessage.GetLeaveApplication, null);
  } catch (err) {
    next(err);
  }
};

LeaveApplicationController.AddLeaveApplication = async (req, res, next) => {
  try {
    let LeaveApplication = req.body;
    // let subtractValue = 0.0;
    let fiscalyear;

    if (LeaveApplication._id) {
      let update = await LeaveApplicationModel.findByIdAndUpdate(LeaveApplication._id, { $set: LeaveApplication });
      return otherHelper.sendResponse(res, HttpStatus.OK, true, update, null, LeaveApplicationConfig.ValidationMessage.AddLeaveApplication, null);
    } else {
      LeaveApplication.Remarks.UserID = req.user.id;
      if (!LeaveApplication.EmployID) {
        LeaveApplication.EmployID = req.user.id;
      }
      LeaveApplication.Added_by = req.user.id;

      // if (LeaveApplication.FromIsHalfDay) {
      //   subtractValue = subtractValue + 0.5;
      // }
      // if (LeaveApplication.ToIsHalfDay) {
      //   subtractValue = subtractValue + 0.5;
      // }

      // let leaveDays = subtractDates(LeaveApplication.From, LeaveApplication.To);
      // LeaveApplication.NoOfDays = leaveDays - subtractValue;

      LeaveApplication.Remarks.UserID = req.user.id;

      //fiscal year check
      fiscalyear = await FindFiscalYear(LeaveApplication.From, LeaveApplication.To);

      if (!fiscalyear.success) {
        return otherHelper.sendResponse(res, HttpStatus.CONFLICT, false, null, fiscalyear.error, LeaveApplicationConfig.ValidationMessage.ValidationError, null);
      }
      fiscalyear = fiscalyear.id;

      //cheking duplicate apllication leave
      let duplicateStatus = await CheckDuplicateLeaveApplication(LeaveApplication.From, LeaveApplication.To, LeaveApplication.EmployID);

      if (!duplicateStatus) {
        return otherHelper.sendResponse(res, HttpStatus.CONFLICT, false, null, { errors: { To: LeaveApplicationConfig.ValidationMessage.DuplicateStatus, From: LeaveApplicationConfig.ValidationMessage.DuplicateStatus } }, LeaveApplicationConfig.ValidationMessage.DuplicateStatus, null);
      }

      let newLeaveApplication = new LeaveApplicationModel(LeaveApplication);
      let leaveOk = await CreateLeaveInternal.LeaveRequest(LeaveApplication.LeaveTypeID, fiscalyear, LeaveApplication.EmployID, LeaveApplication.NoOfDays);
      if (leaveOk.status) {
        try {
          await newLeaveApplication.save();
        } catch (err) {
          next(err);
        }
      } else {
        return otherHelper.sendResponse(res, HttpStatus.CONFLICT, false, null, leaveOk.error, LeaveApplicationConfig.ValidationMessage.ApplicationFailed, null);
      }

      return otherHelper.sendResponse(res, HttpStatus.OK, true, newLeaveApplication, null, LeaveApplicationConfig.ValidationMessage.AddLeaveApplication, null);
    }
  } catch (err) {
    next(err);
  }
};
LeaveApplicationController.DeleteByID = async (req, res, next) => {
  try {
    const id = req.params.id;
    const data = await LeaveApplicationModel.findByIdAndUpdate(id, { $set: { IsDeleted: true, Deleted_By: req.user.id, Deleted_At: new Date() } });
    return otherHelper.sendResponse(res, HttpStatus.OK, true, data, null, LeaveApplicationConfig.ValidationMessage.DeleteByID, null);
  } catch (err) {
    next(err);
  }
};

let subtractDates = (date1, date2) => {
  date1 = moment(date1);
  date2 = moment(date2);
  return date2.diff(date1, 'days') + 1;
};

//checks if both dates belong to same fiscal year
let FindFiscalYear = async (from, to) => {
  let id1 = await FiscalYearInternal.FindFiscalYear(from);
  let id2 = await FiscalYearInternal.FindFiscalYear(to);
  let obj = {};

  if (!moment(from).isSameOrBefore(to)) {
    obj.success = false;
    obj.error = { From: LeaveApplicationConfig.ValidationMessage.ToBefore, To: LeaveApplicationConfig.ValidationMessage.ToBefore };
    return obj;
  }

  if (id1 && id2 && id1 + '' === id2 + '') {
    obj.success = true;
    obj.id = id1;
    return obj;
  } else {
    if (!id1) {
      obj.success = false;
      obj.error = { From: LeaveApplicationConfig.ValidationMessage.FromDateRequired };
      return obj;
    } else if (!id2) {
      obj.success = false;
      obj.error = { To: LeaveApplicationConfig.ValidationMessage.ToDateRequired };
      return obj;
    } else {
      obj.success = false;
      obj.error = { From: LeaveApplicationConfig.ValidationMessage.ToFromInvalid, To: LeaveApplicationConfig.ValidationMessage.ToFromInvalid };
      return obj;
    }
  }
};

let CheckDuplicateLeaveApplication = async (from, to, EmployeeId) => {
  let datas = await LeaveApplicationModel.find({
    EmployID: EmployeeId,
    IsDeleted: false,
    From: { $lte: new Date(to) },
    To: { $gte: new Date(from) },
  });
  if (isEmpty(datas)) {
    return true;
  } else {
    return false;
  }
};

LeaveApplicationController.getNoOfDaysFromDates = async (req, res, next) => {
  let EmployID = req.body.EmployeeID;
  let LeaveType = req.body.LeaveType;
  let FromDate = req.body.FromDate;
  let ToDate = req.body.ToDate;
  let checkholidaystatus;
  let noOfDays;
  let noOfWeekends = 0;
  let subtractValue = 0.0;
  let HalfDays = 0;

  let obj = {};
  obj.Holidays = [];

  if (req.body.FromIsHalfDay) {
    // subtractValue = subtractValue + 0.5;
    HalfDays = HalfDays + 1;
  }
  if (req.body.ToIsHalfDay) {
    // subtractValue = subtractValue + 0.5;
    HalfDays = HalfDays + 1;
  }

  try {
    //checkisholday.....
    checkholidaystatus = await LeaveTypeInternal.getLeaveIsHolidayStatus(LeaveType);
  } catch (err) {
    next(err);
  }

  if (isEmpty(checkholidaystatus)) {
    return otherHelper.sendResponse(res, HttpStatus.NOT_FOUND, false, null, null, 'HolidayCount not configured in leave type!!', null);
  }

  if (!moment(FromDate).isSameOrBefore(ToDate)) {
    obj.error = { From: LeaveApplicationConfig.ValidationMessage.ToBefore, To: LeaveApplicationConfig.ValidationMessage.ToBefore };
  } else {
    noOfDays = await subtractDates(FromDate, ToDate);

    if (checkholidaystatus.IsHolidayCount) {
      //if checkholiday true count holidays

      let weekends = await settingsInternal.getDataByKey('weekends');

      if (isEmpty(weekends)) {
        return otherHelper.sendResponse(res, HttpStatus.NOT_FOUND, false, null, null, 'Weekends not defined in settings!!', null);
      }
      let weekendDays = weekends.length;

      for (var m = moment(FromDate).utc(); m.diff(ToDate, 'days') <= 0; m.add(1, 'days')) {
        let d = moment(m).weekday();
        for (let z = 0; z < weekendDays; z++) {
          if (d === weekends[z]) {
            noOfWeekends = noOfWeekends + 1;
            subtractValue = subtractValue + 1;
            obj.Holidays.push({
              applicableReligion: 'All',
              title: 'weekend',
              date: m.toISOString(),
              applicableTo: 'All',
            });
          }
        }
      }

      let holidayl = await HolidayInternal.getHolidayInBetween(FromDate, ToDate, EmployID, weekends); //weenkends is an array of weekends
      subtractValue = subtractValue + holidayl.length;
      obj.TotalNoOfDays = noOfDays;
      obj.NoOfDays = noOfDays - subtractValue - HalfDays * 0.5;
      obj.HalfDays = HalfDays;
      obj.NoOfWeekend = noOfWeekends;
      obj.HolidaysInBetween = subtractValue;
      obj.Holidays.push(...holidayl);
    } else {
      obj.NoOfDays = noOfDays;
      obj.HolidaysInBetween = 0;
      obj.TotalNoOfDays = await subtractDates(FromDate, ToDate);
      obj.HalfDays = HalfDays;
    }
  }
  if (obj.error) {
    return otherHelper.sendResponse(res, HttpStatus.CONFLICT, false, null, obj.error, LeaveApplicationConfig.ValidationMessage.FetchFailed, null);
  } else {
    return otherHelper.sendResponse(res, HttpStatus.OK, true, obj, null, LeaveApplicationConfig.ValidationMessage.FetchSuccess, null);
  }
};

module.exports = LeaveApplicationController;