function StatCard({
  icon,
  title,
  value,
  description
}) {

  return (

    <div className="stat-card">

      <div className="stat-card-top">

        <div className="stat-icon">
          {icon}
        </div>

      </div>


      <div className="stat-title">
        {title}
      </div>


      <div className="stat-value">
        {value}
      </div>


      <div className="stat-description">
        {description}
      </div>

    </div>

  );

}


export default StatCard;